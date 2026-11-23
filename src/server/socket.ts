import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server } from "socket.io";
import { getToken } from "next-auth/jwt";
import { parse } from "cookie";
import { db } from "../lib/db";
import { requireChannel } from "../lib/permissions";
import { idSchema } from "../lib/validation";
import { AppError } from "../lib/errors";
import { setRealtime } from "../lib/realtime";
import type { ClientEvents, ServerEvents, SocketAck, SocketCallback } from "../lib/chat-types";
import { rateLimit } from "../lib/rate-limit";
import {
  deleteMessage,
  editMessage,
  markChannelRead,
  sendMessage,
  toggleReaction,
} from "../features/chat/service";
import { activeHuddles, huddlePeerSocket, huddleState, isInHuddle, joinHuddle, leaveAllHuddles, leaveHuddle, muteHuddle } from "./huddle";

// Note: In a multi-server setup, this in-memory presence tracker would require the Socket.IO Redis adapter.
type PresenceRecord = {
  socketIds: Set<string>;
  workspaceIds: Set<string>;
  lastSeen: number;
};
const presenceTracker = new Map<string, PresenceRecord>();

async function identity(request: IncomingMessage) {
  // Deliberately accept only the NextAuth cookie, never a client-supplied user ID.
  const req = { cookies: parse(request.headers.cookie ?? ""), headers: {} };
  const token = await getToken({ req: req as Parameters<typeof getToken>[0]["req"], secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.sessionId || typeof token.exp !== "number" || token.exp * 1000 <= Date.now()) return null;
  const session = await db.loginSession.findUnique({ where: { id: token.sessionId } });
  if (!session || session.userId !== token.sub || session.expiresAt <= new Date()) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, lastActiveWorkspaceId: true },
  });
  let membership = user?.lastActiveWorkspaceId
    ? await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: user.lastActiveWorkspaceId, userId: session.userId } },
        select: { workspaceId: true },
      })
    : null;
  if (!membership) {
    membership = await db.membership.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });
  }
  return membership ? { userId: session.userId, sessionId: session.id, workspaceId: membership.workspaceId, name: user?.name ?? "Someone" } : null;
}

// Only messages written for people are sent back; anything unexpected becomes the fallback.
const failure = (error: unknown, fallback: string) => error instanceof AppError ? error.message : fallback;

function respond<Data>(callback: SocketCallback<SocketAck<Data>> | undefined, result: SocketAck<Data>) {
  if (typeof callback === "function") {
    try {
      callback(result);
    } catch {
      // client callback error
    }
  }
}

async function broadcastHuddle(io: Server<ClientEvents, ServerEvents>, channelId: string) {
  const state = huddleState(channelId);
  io.to(`channel:${channelId}`).emit("huddle:state", state);
  const members = await db.channelMember.findMany({ where: { channelId }, select: { userId: true } });
  for (const { userId } of members) io.to(`user:${userId}`).emit("huddle:state", state);
  return state;
}

async function snapshotHuddles(userId: string) {
  const all = activeHuddles();
  if (!all.length) return [];
  const memberships = await db.channelMember.findMany({
    where: { userId, channelId: { in: all.map(huddle => huddle.channelId) } },
    select: { channelId: true },
  });
  const allowed = new Set(memberships.map(member => member.channelId));
  return all.filter(huddle => allowed.has(huddle.channelId));
}

export function attachRealtime(http: HttpServer) {
  const origin = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").origin;
  const io = new Server<ClientEvents, ServerEvents, never, { userId: string; sessionId: string; workspaceId: string; name: string }>(http, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 20_000,
    allowRequest: (request, callback) => {
      // Browsers omit Origin on same-origin polling GETs.
      const sameOriginPolling = !request.headers.origin
        && request.headers["sec-fetch-site"] === "same-origin"
        && request.headers.host === new URL(origin).host
        && new URL(request.url ?? "/", origin).searchParams.get("transport") === "polling";
      callback(null, request.headers.origin === origin || sameOriginPolling);
    },
  });

  io.use(async (socket, next) => {
    try {
      const user = await identity(socket.request);
      if (!user) return next(new Error("Please sign in to connect."));
      socket.data = user;
      next();
    } catch {
      next(new Error("Unable to authenticate connection."));
    }
  });

  io.on("connection", socket => {
    const { userId, workspaceId } = socket.data;

    // 1. Join user private room & workspace room
    void socket.join(`user:${userId}`);
    if (workspaceId) {
      void socket.join(`workspace:${workspaceId}`);
    }

    // 2. Track Presence
    let presence = presenceTracker.get(userId);
    if (!presence) {
      presence = { socketIds: new Set(), workspaceIds: new Set(), lastSeen: Date.now() };
      presenceTracker.set(userId, presence);
    }
    const wasOffline = presence.socketIds.size === 0;
    presence.socketIds.add(socket.id);
    if (workspaceId) presence.workspaceIds.add(workspaceId);
    presence.lastSeen = Date.now();

    if (wasOffline && workspaceId) {
      io.to(`workspace:${workspaceId}`).emit("presence:update", { userId, workspaceId, online: true });
    }

    // Heartbeat
    socket.on("heartbeat", () => {
      const p = presenceTracker.get(socket.data.userId);
      if (p) p.lastSeen = Date.now();
    });

    // Channel Join
    socket.on("channel:join", async (input, ack) => {
      try {
        const channelId = idSchema.parse(input?.channelId);
        rateLimit(`sub:${socket.data.userId}`, 120);
        if (!(await identity(socket.request))) throw new Error("Please sign in again.");
        await requireChannel(socket.data.userId, channelId);

        // Leave any previous channel rooms on this socket to prevent cross-leakage
        for (const room of socket.rooms) {
          if (room.startsWith("channel:")) await socket.leave(room);
        }
        await socket.join(`channel:${channelId}`);
        socket.emit("huddle:state", huddleState(channelId));
        respond(ack, { ok: true, data: { channelId } });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "You cannot subscribe to this channel.") });
      }
    });

    // Channel Leave
    socket.on("channel:leave", (input, ack) => {
      const parsed = idSchema.safeParse(input?.channelId);
      if (parsed.success) {
        void socket.leave(`channel:${parsed.data}`);
        respond(ack, { ok: true, data: { channelId: parsed.data } });
      }
    });

    // Channel Read
    socket.on("channel:read", async (input, ack) => {
      try {
        const channelId = idSchema.parse(input?.channelId);
        rateLimit(`read:${socket.data.userId}`, 60);
        await requireChannel(socket.data.userId, channelId);
        const { lastReadAt } = await markChannelRead(socket.data.userId, channelId);
        respond(ack, { ok: true, data: { channelId, lastReadAt } });

        // Update unread count to 0 for this user
        io.to(`user:${socket.data.userId}`).emit("unread:update", {
          channelId,
          unreadCount: 0,
          mentionCount: 0,
        });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Failed to mark channel as read.") });
      }
    });

    // Message Send via Socket
    socket.on("message:send", async (input, ack) => {
      try {
        rateLimit(`msg-rate:${socket.data.userId}`, 10, 10_000);
        const { channelId: rawChannelId, ...fields } = input ?? {};
        const channelId = idSchema.parse(rawChannelId);
        // The message schema is strict and has no channelId; sendMessage validates the rest.
        const message = await sendMessage(socket.data.userId, channelId, fields);
        respond(ack, { ok: true, data: message });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to send message.") });
      }
    });

    // Message Edit
    socket.on("message:edit", async (input, ack) => {
      try {
        rateLimit(`msg-edit:${socket.data.userId}`, 20, 10_000);
        const messageId = idSchema.parse(input?.messageId);
        // The edit schema is strict, so pass only its own field; editMessage validates it.
        const message = await editMessage(socket.data.userId, messageId, { body: input?.body });
        respond(ack, { ok: true, data: message });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to edit message.") });
      }
    });

    // Message Delete
    socket.on("message:delete", async (input, ack) => {
      try {
        rateLimit(`msg-del:${socket.data.userId}`, 20, 10_000);
        const messageId = idSchema.parse(input?.messageId);
        const result = await deleteMessage(socket.data.userId, messageId);
        respond(ack, { ok: true, data: { messageId: result.id } });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to delete message.") });
      }
    });

    // Reaction Toggle
    socket.on("reaction:toggle", async (input, ack) => {
      try {
        rateLimit(`react:${socket.data.userId}`, 40, 10_000);
        const messageId = idSchema.parse(input?.messageId);
        const result = await toggleReaction(socket.data.userId, messageId, { emoji: input?.emoji });
        respond(ack, { ok: true, data: result });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to toggle reaction.") });
      }
    });

    socket.on("typing", async input => {
      const parsed = idSchema.safeParse(input?.channelId);
      const room = parsed.success ? `channel:${parsed.data}` : "";
      if (!room || !socket.rooms.has(room)) return;
      try { rateLimit(`typing:${socket.data.userId}`, 40); } catch { return; }
      const event = { channelId: parsed.data!, userId: socket.data.userId, name: socket.data.name };
      socket.to(room).except(`user:${socket.data.userId}`).emit("typing", event);
    });

    void snapshotHuddles(socket.data.userId).then(states => {
      for (const state of states) socket.emit("huddle:state", state);
    });

    socket.on("huddle:join", async (input, ack) => {
      try {
        const channelId = idSchema.parse(input?.channelId);
        rateLimit(`huddle:${socket.data.userId}`, 30, 10_000);
        await requireChannel(socket.data.userId, channelId);
        const { left } = joinHuddle(channelId, { userId: socket.data.userId, name: socket.data.name, muted: false, socketId: socket.id });
        for (const previous of left) await broadcastHuddle(io, previous);
        respond(ack, { ok: true, data: await broadcastHuddle(io, channelId) });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to join the huddle.") });
      }
    });

    socket.on("huddle:leave", async (input, ack) => {
      try {
        const channelId = idSchema.parse(input?.channelId);
        leaveHuddle(channelId, socket.data.userId);
        respond(ack, { ok: true, data: await broadcastHuddle(io, channelId) });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to leave the huddle.") });
      }
    });

    socket.on("huddle:mute", async (input, ack) => {
      try {
        const channelId = idSchema.parse(input?.channelId);
        const state = muteHuddle(channelId, socket.data.userId, Boolean(input?.muted));
        if (!state) throw new Error("Join the huddle first.");
        respond(ack, { ok: true, data: await broadcastHuddle(io, channelId) });
      } catch (err) {
        respond(ack, { ok: false, error: failure(err, "Unable to update mute.") });
      }
    });

    socket.on("huddle:signal", input => {
      const channelId = idSchema.safeParse(input?.channelId);
      const toUserId = idSchema.safeParse(input?.toUserId);
      if (!channelId.success || !toUserId.success) return;
      if (!isInHuddle(channelId.data, socket.data.userId) || !isInHuddle(channelId.data, toUserId.data)) return;
      const target = huddlePeerSocket(channelId.data, toUserId.data);
      if (!target) return;
      io.to(target).emit("huddle:signal", {
        channelId: channelId.data,
        fromUserId: socket.data.userId,
        toUserId: toUserId.data,
        payload: input?.payload,
      });
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
      for (const channelId of leaveAllHuddles(userId, socket.id)) void broadcastHuddle(io, channelId);
      const p = presenceTracker.get(userId);
      if (p) {
        p.socketIds.delete(socket.id);
        if (p.socketIds.size === 0) {
          if (workspaceId) {
            io.to(`workspace:${workspaceId}`).emit("presence:update", { userId, workspaceId, online: false });
          }
        }
      }
    });
  });

  setRealtime({
    async publish(event) {
      const channelId = event.message.channelId;
      const ids = io.sockets.adapter.rooms.get(`channel:${channelId}`) ?? new Set<string>();

      // Deliver to active sockets in channel
      await Promise.allSettled([...ids].map(async id => {
        const socket = io.sockets.sockets.get(id);
        if (!socket) return;
        try {
          if (!(await identity(socket.request))) {
            socket.disconnect(true);
            return;
          }
          await requireChannel(socket.data.userId, channelId);
          socket.emit("message:new", event);
          socket.emit("message:created", event); // backwards compat
        } catch {
          await socket.leave(`channel:${channelId}`);
          socket.emit("access:revoked");
        }
      }));

      // Broadcast unread badge notification to workspace channel members not currently viewing
      try {
        const members = await db.channelMember.findMany({
          where: { channelId },
          select: { userId: true, lastReadAt: true },
        });

        for (const member of members) {
          if (member.userId === event.message.authorId) continue;
          const unreadCount = await db.message.count({
            where: {
              channelId,
              deletedAt: null,
              threadRootId: null,
              ...(member.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
            },
          });
          const mentionCount = await db.mention.count({
            where: {
              message: {
                channelId,
                deletedAt: null,
                ...(member.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
              },
              OR: [
                { mentionedUserId: member.userId },
                { kind: "CHANNEL" },
                { kind: "HERE" },
              ],
            },
          });

          io.to(`user:${member.userId}`).emit("unread:update", {
            channelId,
            unreadCount,
            mentionCount,
          });
        }
      } catch (err) {
        console.error("Failed to broadcast unread badges", err);
      }
    },

    async publishMessageUpdated(event) {
      io.to(`channel:${event.message.channelId}`).emit("message:updated", event);
    },

    async publishMessageDeleted(event) {
      io.to(`channel:${event.channelId}`).emit("message:deleted", event);
    },

    async publishReactionUpdated(event) {
      io.to(`channel:${event.channelId}`).emit("reaction:updated", event);
    },

    async publishPollUpdated(channelId, messageId, poll) {
      io.to(`channel:${channelId}`).emit("poll:updated", { channelId, messageId, poll });
    },

    async publishChannelUpdated(workspaceId, channel) {
      io.to(`workspace:${workspaceId}`).emit("channel:updated", { channel });
    },

    onlineUserIds() {
      return new Set([...presenceTracker].filter(([, record]) => record.socketIds.size > 0).map(([userId]) => userId));
    },

    async notifyUser(userId, announcement) {
      io.to(`user:${userId}`).emit("notification:new", { announcement });
    },

    async publishUnreadUpdate(userId, event) {
      io.to(`user:${userId}`).emit("unread:update", event);
    },

    async publishPresence(workspaceId, userId, online) {
      io.to(`workspace:${workspaceId}`).emit("presence:update", { userId, workspaceId, online });
    },

    async publishStatus(workspaceIds, userId, status) {
      if (workspaceIds.length) io.to(workspaceIds.map(id => `workspace:${id}`)).emit("status:update", { userId, status });
    },

    disconnectSession(sessionId) {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.sessionId === sessionId) socket.disconnect(true);
      }
    },

    revokeUser(userId) {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.userId === userId) {
          for (const room of socket.rooms) {
            if (room.startsWith("channel:")) void socket.leave(room);
          }
          socket.emit("access:revoked");
        }
      }
    },
  });

  return io;
}
