import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server } from "socket.io";
import { getToken } from "next-auth/jwt";
import { parse } from "cookie";
import { db } from "../lib/db";
import { requireChannel } from "../lib/permissions";
import { idSchema } from "../lib/validation";
import { setRealtime } from "../lib/realtime";
import type { ClientEvents, ServerEvents } from "../lib/chat-types";
import { rateLimit } from "../lib/rate-limit";

async function identity(request: IncomingMessage) {
  // Deliberately accept only the NextAuth cookie, never a client-supplied user ID.
  const req = { cookies: parse(request.headers.cookie ?? ""), headers: {} };
  const token = await getToken({ req: req as Parameters<typeof getToken>[0]["req"], secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.sessionId || typeof token.exp !== "number" || token.exp * 1000 <= Date.now()) return null;
  const session = await db.loginSession.findUnique({ where: { id: token.sessionId } });
  return session && session.userId === token.sub && session.expiresAt > new Date() ? { userId: session.userId, sessionId: session.id } : null;
}

export function attachRealtime(http: HttpServer) {
  const origin = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").origin;
  const io = new Server<ClientEvents, ServerEvents, never, { userId: string; sessionId: string }>(http, {
    cors: { origin, credentials: true }, maxHttpBufferSize: 20_000,
    allowRequest: (request, callback) => {
      // Browsers omit Origin on same-origin polling GETs. Fetch Metadata plus the
      // configured Host permits that transport without opening cross-origin sockets.
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
    } catch { next(new Error("Unable to authenticate connection.")); }
  });
  io.on("connection", socket => {
    socket.on("channel:join", async (input, ack) => {
      if (typeof ack !== "function") return;
      try {
        const channelId = idSchema.parse(input?.channelId);
        rateLimit(`subscribe:${socket.data.userId}`, 120);
        if (!(await identity(socket.request))) throw new Error("Please sign in again.");
        await requireChannel(socket.data.userId, channelId);
        // One active channel per connection. Opening a new channel cannot retain old subscriptions.
        for (const room of socket.rooms) if (room.startsWith("channel:")) await socket.leave(room);
        await socket.join(`channel:${channelId}`);
        ack({ ok: true });
      } catch { ack({ ok: false, error: "You cannot subscribe to this channel." }); }
    });
    socket.on("channel:leave", input => {
      const parsed = idSchema.safeParse(input?.channelId);
      if (parsed.success) void socket.leave(`channel:${parsed.data}`);
    });
  });
  setRealtime({
    async publish(event) {
      const channelId = event.message.channelId;
      // Do not blindly broadcast to a room: membership or session may have been revoked since join.
      const ids = io.sockets.adapter.rooms.get(`channel:${channelId}`) ?? new Set<string>();
      await Promise.allSettled([...ids].map(async id => {
        const socket = io.sockets.sockets.get(id);
        if (!socket) return;
        try {
          if (!(await identity(socket.request))) { socket.disconnect(true); return; }
          await requireChannel(socket.data.userId, channelId);
          socket.emit("message:created", event);
        } catch {
          await socket.leave(`channel:${channelId}`);
          socket.emit("access:revoked");
        }
      }));
    },
    disconnectSession(sessionId) {
      for (const socket of io.sockets.sockets.values()) if (socket.data.sessionId === sessionId) socket.disconnect(true);
    },
    revokeUser(userId) {
      for (const socket of io.sockets.sockets.values()) if (socket.data.userId === userId) {
        for (const room of socket.rooms) if (room.startsWith("channel:")) void socket.leave(room);
        socket.emit("access:revoked");
      }
    },
  });
  return io;
}
