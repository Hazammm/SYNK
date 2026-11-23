"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Headphones, Mic, MicOff, PhoneOff } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import type { ChannelSummary, ClientEvents, HuddleState, ServerEvents, SocketAck } from "@/lib/chat-types";
import styles from "./Chat.module.css";

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export type HuddleSession = ReturnType<typeof useHuddle>;

const HuddleContext = createContext<HuddleSession | null>(null);

// Lives in the chat layout so the call keeps running while pages for other channels mount.
export function HuddleProvider({ viewerId, children }: { viewerId: string; children: ReactNode }) {
  const huddle = useHuddle(viewerId);
  return <HuddleContext.Provider value={huddle}>{children}</HuddleContext.Provider>;
}

export function useHuddleSession() {
  const huddle = useContext(HuddleContext);
  if (!huddle) throw new Error("useHuddleSession needs a HuddleProvider.");
  return huddle;
}

function hangup(peers: Map<string, RTCPeerConnection>, local: MediaStream | null, remote: HTMLDivElement | null) {
  peers.forEach(peer => peer.close());
  peers.clear();
  local?.getTracks().forEach(track => track.stop());
  if (remote) remote.innerHTML = "";
}

function useHuddle(viewerId: string) {
  const [rooms, setRooms] = useState<Record<string, HuddleState>>({});
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const joinedIdRef = useRef<string | null>(null);
  const viewerRef = useRef(viewerId);
  const socketRef = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    viewerRef.current = viewerId;
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: true, withCredentials: true });
    socketRef.current = socket;
    const audio = document.createElement("div");
    audio.hidden = true;
    document.body.appendChild(audio);
    remoteAudio.current = audio;
    const connections = peers.current;

    socket.on("huddle:state", next => {
      setRooms(current => {
        if (next.participants.length) return { ...current, [next.channelId]: next };
        const rest = { ...current };
        delete rest[next.channelId];
        return rest;
      });
      if (joinedIdRef.current === next.channelId && !next.participants.some(peer => peer.userId === viewerRef.current)) {
        hangup(peers.current, localStream.current, remoteAudio.current);
        localStream.current = null;
        joinedIdRef.current = null;
        setJoinedId(null);
        setMuted(false);
      }
    });

    socket.on("huddle:signal", async event => {
      if (event.channelId !== joinedIdRef.current || event.toUserId !== viewerRef.current) return;
      const payload = event.payload as { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      const peer = peers.current.get(event.fromUserId) ?? await ensurePeer(event.fromUserId, false);
      if (payload?.sdp?.type === "offer") {
        await peer.setRemoteDescription(payload.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("huddle:signal", { channelId: event.channelId, toUserId: event.fromUserId, payload: { sdp: peer.localDescription } });
      } else if (payload?.sdp?.type === "answer") {
        await peer.setRemoteDescription(payload.sdp);
      } else if (payload?.candidate) {
        try { await peer.addIceCandidate(payload.candidate); } catch { /* stale candidate */ }
      }
    });

    return () => {
      if (joinedIdRef.current) socket.emit("huddle:leave", { channelId: joinedIdRef.current });
      hangup(connections, localStream.current, audio);
      localStream.current = null;
      audio.remove();
      remoteAudio.current = null;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [viewerId]);

  async function ensurePeer(userId: string, offer: boolean) {
    const existing = peers.current.get(userId);
    if (existing) return existing;
    const channelId = joinedIdRef.current;
    if (!channelId) throw new Error("Not in a huddle.");
    const peer = new RTCPeerConnection(ICE);
    peers.current.set(userId, peer);
    localStream.current?.getTracks().forEach(track => peer.addTrack(track, localStream.current!));
    peer.onicecandidate = event => {
      if (event.candidate) socketRef.current?.emit("huddle:signal", { channelId, toUserId: userId, payload: { candidate: event.candidate.toJSON() } });
    };
    peer.ontrack = event => {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.srcObject = event.streams[0];
      remoteAudio.current?.appendChild(el);
    };
    if (offer) {
      const session = await peer.createOffer();
      await peer.setLocalDescription(session);
      socketRef.current?.emit("huddle:signal", { channelId, toUserId: userId, payload: { sdp: peer.localDescription } });
    }
    return peer;
  }

  async function join(channelId: string) {
    setError("");
    if (joinedIdRef.current === channelId) return;
    const previous = joinedIdRef.current;
    try {
      if (!localStream.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getAudioTracks().forEach(track => { track.enabled = !muted; });
        localStream.current = stream;
      }
      const socket = socketRef.current;
      if (!socket) throw new Error("Not connected.");
      const ack = await new Promise<SocketAck<HuddleState>>((resolve, reject) => {
        socket.timeout(10_000).emit("huddle:join", { channelId }, (timeout, result) => {
          if (timeout) { reject(new Error("Timed out joining the huddle.")); return; }
          resolve(result as SocketAck<HuddleState>);
        });
      });
      if (!ack.ok) throw new Error(ack.error);
      hangup(peers.current, null, remoteAudio.current);
      joinedIdRef.current = channelId;
      setRooms(current => ({ ...current, [channelId]: ack.data ?? { channelId, participants: [] } }));
      setJoinedId(channelId);
      const others = (ack.data?.participants ?? []).filter(peer => peer.userId !== viewerId);
      await Promise.all(others.map(peer => ensurePeer(peer.userId, true)));
    } catch (cause) {
      if (!previous) {
        hangup(peers.current, localStream.current, remoteAudio.current);
        localStream.current = null;
        joinedIdRef.current = null;
        setJoinedId(null);
      }
      setError(cause instanceof Error ? cause.message : "Microphone permission is needed for huddles.");
    }
  }

  function leave() {
    const channelId = joinedIdRef.current;
    if (channelId) socketRef.current?.emit("huddle:leave", { channelId });
    hangup(peers.current, localStream.current, remoteAudio.current);
    localStream.current = null;
    joinedIdRef.current = null;
    setJoinedId(null);
    setMuted(false);
  }

  function toggleMute() {
    const channelId = joinedIdRef.current;
    if (!channelId) return;
    const next = !muted;
    localStream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    socketRef.current?.emit("huddle:mute", { channelId, muted: next });
    setMuted(next);
  }

  return { rooms, joinedId, muted, error, join, leave, toggleMute };
}

function huddleLabel(channels: ChannelSummary[], channelId: string) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel) return "huddle";
  if (channel.type === "DM" || channel.type === "GROUP_DM") return channel.otherUser?.name ?? channel.name ?? "direct message";
  return `#${channel.name}`;
}

export function HuddleHeaderButton({ channelId, huddle }: { channelId: string; huddle: HuddleSession }) {
  const live = Boolean(huddle.rooms[channelId]?.participants.length);
  const inThis = huddle.joinedId === channelId;
  const label = inThis ? "In huddle" : live ? "Join huddle" : "Start huddle";
  return (
    <button
      type="button"
      className={styles.iconBtn}
      data-huddle={inThis ? "in" : live ? "live" : undefined}
      aria-label={label}
      title={label}
      onClick={() => void huddle.join(channelId)}
    >
      <Headphones size={16} />
    </button>
  );
}

export function HuddleDock({
  huddle,
  channels,
  onOpen,
}: {
  huddle: HuddleSession;
  channels: ChannelSummary[];
  onOpen: (channelId: string) => void;
}) {
  const channelId = huddle.joinedId;
  const state = channelId ? huddle.rooms[channelId] : undefined;
  const count = state?.participants.length ?? 0;
  return (
    <>
      {huddle.error && <p className={styles.huddleError} role="alert">{huddle.error}</p>}
      {channelId && (
        <div className={styles.huddleDock}>
          <Headphones size={16} aria-hidden="true" />
          <button type="button" className={styles.huddlePlace} onClick={() => onOpen(channelId)}>
            Huddle in {huddleLabel(channels, channelId)}
          </button>
          <span>{count} {count === 1 ? "person" : "people"}</span>
          {state?.participants.map(peer => (
            <em key={peer.userId}>{peer.name}{peer.muted ? " (muted)" : ""}</em>
          ))}
          <button type="button" className={styles.iconBtn} aria-label={huddle.muted ? "Unmute microphone" : "Mute microphone"} onClick={huddle.toggleMute}>
            {huddle.muted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
          <button type="button" className={styles.huddleLeave} onClick={huddle.leave} aria-label="Leave huddle">
            <PhoneOff size={14} /> Leave
          </button>
        </div>
      )}
    </>
  );
}

export function huddleActive(rooms: Record<string, HuddleState>, channelId: string) {
  return Boolean(rooms[channelId]?.participants.length);
}
