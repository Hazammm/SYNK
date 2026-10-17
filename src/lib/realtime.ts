import type { MessageEvent } from "./chat-types";
type Realtime = { publish: (event: MessageEvent) => Promise<void>; disconnectSession: (sessionId: string) => void; revokeUser: (userId: string) => void };
const state = globalThis as unknown as { synkRealtime?: Realtime };
export function realtime() { return state.synkRealtime; }
export function setRealtime(value: Realtime | undefined) { state.synkRealtime = value; }
