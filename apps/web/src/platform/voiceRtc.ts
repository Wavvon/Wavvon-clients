// Voice over a WebRTC data channel (voice-transport-v3.md). The hub is
// ICE-lite and answers with its host candidates, so no STUN or TURN server is
// configured. Signalling rides the hub's main socket: `voice_rtc_offer` with
// the single-use voice token, answered by `voice_rtc_answer`.
//
// RTCPeerConnection does not exist in workers, so the channel lives on the
// main thread and the encode worker hands it sealed packets.

/** An open voice data channel: packets out, packets in, and its end. */
export interface RtcVoiceLink {
  send(packet: Uint8Array): void;
  close(): void;
  onPacket: (packet: Uint8Array) => void;
  onClose: () => void;
}

/** Sends `voice_rtc_offer` and resolves with the hub's answer SDP. */
export type RtcSignal = (token: string, sdp: string) => Promise<string>;

const OPEN_TIMEOUT_MS = 10_000;

export async function openRtcVoice(token: string, signal: RtcSignal): Promise<RtcVoiceLink> {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("voice", {
    negotiated: true,
    id: 0,
    ordered: false,
    maxRetransmits: 0,
  });
  channel.binaryType = "arraybuffer";

  const link: RtcVoiceLink = {
    send: (packet) => {
      if (channel.readyState === "open") channel.send(packet as Uint8Array<ArrayBuffer>);
    },
    close: () => pc.close(),
    onPacket: () => {},
    onClose: () => {},
  };

  try {
    await pc.setLocalDescription(await pc.createOffer());
    await iceGatheringComplete(pc);
    const answer = await signal(token, pc.localDescription!.sdp);
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    await channelOpen(channel);
  } catch (e) {
    pc.close();
    throw e;
  }

  channel.onmessage = (e: MessageEvent<ArrayBuffer>) => link.onPacket(new Uint8Array(e.data));
  channel.onclose = () => link.onClose();
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") link.onClose();
  };
  return link;
}

/** The offer goes out whole, candidates included: the hub has no trickle. */
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

function channelOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("voice data channel did not open")), OPEN_TIMEOUT_MS);
    channel.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    channel.onclose = () => {
      clearTimeout(timer);
      reject(new Error("voice data channel closed before opening"));
    };
  });
}
