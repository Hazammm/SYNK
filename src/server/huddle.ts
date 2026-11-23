import type { HuddlePeer, HuddleState } from "../lib/chat-types";

type Participant = HuddlePeer & { socketId: string };
const rooms = new Map<string, Map<string, Participant>>();

export function huddleState(channelId: string): HuddleState {
  const room = rooms.get(channelId);
  return { channelId, participants: [...(room?.values() ?? [])].map(({ userId, name, muted }) => ({ userId, name, muted })) };
}

export function activeHuddles() {
  return [...rooms.keys()].map(huddleState).filter(state => state.participants.length);
}

export function joinHuddle(channelId: string, participant: Participant) {
  const left: string[] = [];
  for (const [id, room] of rooms) {
    if (id === channelId || !room.has(participant.userId)) continue;
    room.delete(participant.userId);
    if (!room.size) rooms.delete(id);
    left.push(id);
  }
  const room = rooms.get(channelId) ?? new Map<string, Participant>();
  room.set(participant.userId, participant);
  rooms.set(channelId, room);
  return { joined: huddleState(channelId), left };
}

export function leaveHuddle(channelId: string, userId: string, socketId?: string) {
  const room = rooms.get(channelId);
  const current = room?.get(userId);
  if (!room || !current || (socketId && current.socketId !== socketId)) return huddleState(channelId);
  room.delete(userId);
  if (!room.size) rooms.delete(channelId);
  return huddleState(channelId);
}

export function muteHuddle(channelId: string, userId: string, muted: boolean) {
  const participant = rooms.get(channelId)?.get(userId);
  if (!participant) return null;
  participant.muted = muted;
  return huddleState(channelId);
}

export function huddlePeerSocket(channelId: string, userId: string) {
  return rooms.get(channelId)?.get(userId)?.socketId ?? null;
}

export function leaveAllHuddles(userId: string, socketId: string) {
  const changed: string[] = [];
  for (const channelId of [...rooms.keys()]) {
    if (!rooms.get(channelId)?.has(userId)) continue;
    leaveHuddle(channelId, userId, socketId);
    changed.push(channelId);
  }
  return changed;
}

export function isInHuddle(channelId: string, userId: string) {
  return rooms.get(channelId)?.has(userId) ?? false;
}
