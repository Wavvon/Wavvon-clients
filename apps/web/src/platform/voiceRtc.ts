// Voice over a WebRTC data channel (voice-transport-v3.md). The hub is
// ICE-lite and answers with its host candidates, so no STUN or TURN server is
// configured. Signalling rides the hub's main socket: `voice_rtc_offer` with
// the single-use voice token, answered by `voice_rtc_answer`.
//
// The peer connection lives on the main thread (RTCPeerConnection does not
// exist in workers), but the data channel is handed to the encode worker
// where the browser allows it, so a busy main thread does not hold up the
// packets (P67).

/** Sends `voice_rtc_offer` and resolves with the hub's answer SDP. */
export type RtcSignal = (token: string, sdp: string) => Promise<string>;

const OPEN_TIMEOUT_MS = 10_000;

/** The peer and its one voice channel: negotiated id 0, unordered, no
 *  retransmissions. Created before the worker so the channel can be
 *  transferred to it in the same task. */
export function createRtcPeer(): { pc: RTCPeerConnection; channel: RTCDataChannel } {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("voice", {
    negotiated: true,
    id: 0,
    ordered: false,
    maxRetransmits: 0,
  });
  channel.binaryType = "arraybuffer";
  return { pc, channel };
}

/** Offers, waits for the answer and applies it. The offer goes out whole,
 *  candidates included: the hub has no trickle. */
export async function negotiateRtc(pc: RTCPeerConnection, token: string, signal: RtcSignal): Promise<void> {
  await pc.setLocalDescription(await pc.createOffer());
  await iceGatheringComplete(pc);
  const answer = await signal(token, pc.localDescription!.sdp);
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

function iceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
  });
}

/** For a channel that stayed on the main thread. */
export function channelOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("voice data channel did not open")), OPEN_TIMEOUT_MS);
    channel.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    channel.addEventListener("close", () => {
      clearTimeout(timer);
      reject(new Error("voice data channel closed before opening"));
    }, { once: true });
  });
}
