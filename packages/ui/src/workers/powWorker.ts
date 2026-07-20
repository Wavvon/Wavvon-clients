import { minePowChunk } from "@wavvon/core";

// Runs the lobby proof-of-work search off the main thread so the lobby UI
// stays responsive. `self` is typed as `Worker` (the interface the main
// thread sees) rather than pulling in the "webworker" lib, which would
// conflict with this project's "dom" lib — postMessage/onmessage have the
// same shape from both sides.
const ctx = self as unknown as Worker;

interface StartMessage {
  type: "start";
  pubkeyHex: string;
  targetLevel: number;
  /** Decimal string — nonce is a u64, outside JS's safe integer range. */
  startNonce: string;
  bestLevel: number;
}
interface StopMessage {
  type: "stop";
}
type InMessage = StartMessage | StopMessage;

export interface PowProgressMessage {
  type: "progress";
  nonce: string;
  level: number;
  attempts: number;
}
export interface PowDoneMessage {
  type: "done";
  nonce: string;
  level: number;
}
export type PowOutMessage = PowProgressMessage | PowDoneMessage;

// Iterations per tick: large enough to amortize call overhead, small enough
// that a "stop" message (queued while a chunk runs) is picked up within tens
// of milliseconds via the setTimeout yield below.
const CHUNK_SIZE = 20_000;

let stopped = false;
let runToken = 0;

ctx.onmessage = (ev: MessageEvent<InMessage>) => {
  const msg = ev.data;
  if (msg.type === "stop") {
    stopped = true;
    return;
  }
  stopped = false;
  const token = ++runToken;
  run(msg, token);
};

function run(msg: StartMessage, token: number): void {
  let nonce = BigInt(msg.startNonce);
  let bestLevel = msg.bestLevel;
  let attempts = 0;

  function tick(): void {
    if (stopped || token !== runToken) return;
    const result = minePowChunk(msg.pubkeyHex, nonce, msg.targetLevel, CHUNK_SIZE, bestLevel);
    attempts += CHUNK_SIZE;
    nonce = result.lastNonce;

    if (result.bestLevel > bestLevel) {
      bestLevel = result.bestLevel;
      const progress: PowProgressMessage = {
        type: "progress",
        nonce: result.bestNonce.toString(),
        level: bestLevel,
        attempts,
      };
      ctx.postMessage(progress);
    }

    if (result.reachedTarget) {
      const done: PowDoneMessage = { type: "done", nonce: result.bestNonce.toString(), level: bestLevel };
      ctx.postMessage(done);
      return;
    }

    setTimeout(tick, 0);
  }

  tick();
}
