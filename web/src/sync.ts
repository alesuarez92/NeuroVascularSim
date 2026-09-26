// Keeping browser windows of the app in step (a view popped out into its own
// window, or two tabs): the experiment being edited and the opened run are
// sent over a BroadcastChannel. Pure message handling here; the channel
// itself is opened in state.ts.

import type { ExperimentSpec } from "./api";
import { isWinId, type WinId } from "./windows";

export const CHANNEL = "neurovascularsim";

export type SyncMessage =
  | { source: string; kind: "spec"; spec: ExperimentSpec }
  | { source: string; kind: "run"; runId: string | null }
  | { source: string; kind: "hello" } // a window just opened: others send what they show
  | { source: string; kind: "popin"; window: WinId }; // a popped-out view was closed

/** What a received message asks this window to do. */
export type SyncAction =
  | { kind: "none" }
  | { kind: "spec"; spec: ExperimentSpec; json: string }
  | { kind: "run"; runId: string | null }
  | { kind: "reply" }
  | { kind: "popin"; window: WinId };

/**
 * Interpret a message. Messages from this window, malformed ones, and specs
 * identical to the one shown (the echo of our own change) do nothing, so
 * two windows never bounce the same change back and forth.
 */
export function handleSyncMessage(data: unknown, self: string, currentSpecJson: string, currentRunId: string | null): SyncAction {
  const m = data as Partial<SyncMessage> | null;
  if (!m || typeof m !== "object" || typeof m.source !== "string" || m.source === self) return { kind: "none" };
  switch (m.kind) {
    case "spec": {
      const spec = (m as { spec?: unknown }).spec;
      if (!spec || typeof spec !== "object") return { kind: "none" };
      const json = JSON.stringify(spec);
      return json === currentSpecJson ? { kind: "none" } : { kind: "spec", spec: spec as ExperimentSpec, json };
    }
    case "run": {
      const runId = (m as { runId?: unknown }).runId;
      if (runId !== null && typeof runId !== "string") return { kind: "none" };
      return runId === currentRunId ? { kind: "none" } : { kind: "run", runId };
    }
    case "hello":
      return { kind: "reply" };
    case "popin": {
      const w = (m as { window?: unknown }).window;
      return isWinId(w) ? { kind: "popin", window: w } : { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

/** Whether a local change should be sent: only if it differs from what was last sent or received. */
export const shouldBroadcast = (json: string, lastSynced: string) => json !== lastSynced;

export const newWindowId = () => Math.random().toString(36).slice(2, 10);
