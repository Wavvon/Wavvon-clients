import type {
  WsScreenShareOffer,
  WsScreenShareAnswer,
  WsScreenShareIce,
  WsScreenShareViewerJoined,
  WsScreenShareViewerLeft,
} from "../types";

export type WebRtcSignal =
  | WsScreenShareOffer
  | WsScreenShareAnswer
  | WsScreenShareIce
  | WsScreenShareViewerJoined
  | WsScreenShareViewerLeft;

export interface WebRtcSharerHandlers {
  onSendOffer: (toPubkey: string, streamId: string, sdp: string) => void;
  onSendIce: (toPubkey: string, streamId: string, candidate: string) => void;
  onViewerConnected: (pubkey: string) => void;
  onViewerDisconnected: (pubkey: string) => void;
}

export interface WebRtcViewerHandlers {
  onSendAnswer: (toPubkey: string, streamId: string, sdp: string) => void;
  onSendIce: (toPubkey: string, streamId: string, candidate: string) => void;
  onRemoteStream: (streamId: string, stream: MediaStream) => void;
  onDisconnected: (streamId: string) => void;
}

type PeerEntry = { pc: RTCPeerConnection; pubkey: string };

export class WebRtcSharerSession {
  private peers = new Map<string, PeerEntry>();
  private localStream: MediaStream;
  private streamId: string;
  private handlers: WebRtcSharerHandlers;
  private iceServers: RTCIceServer[];

  constructor(localStream: MediaStream, streamId: string, handlers: WebRtcSharerHandlers, turnUrl?: string) {
    this.localStream = localStream;
    this.streamId = streamId;
    this.handlers = handlers;
    this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    if (turnUrl) this.iceServers.push({ urls: turnUrl });
  }

  async handleViewerJoined(viewerPubkey: string) {
    if (this.peers.has(viewerPubkey)) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.handlers.onSendIce(viewerPubkey, this.streamId, JSON.stringify(e.candidate.toJSON()));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        this.handlers.onViewerConnected(viewerPubkey);
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.peers.delete(viewerPubkey);
        this.handlers.onViewerDisconnected(viewerPubkey);
      }
    };

    this.peers.set(viewerPubkey, { pc, pubkey: viewerPubkey });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.handlers.onSendOffer(viewerPubkey, this.streamId, offer.sdp ?? "");
  }

  async handleAnswer(fromPubkey: string, sdp: string) {
    const entry = this.peers.get(fromPubkey);
    if (!entry) return;
    await entry.pc.setRemoteDescription({ type: "answer", sdp });
  }

  async handleIce(fromPubkey: string, candidateJson: string) {
    const entry = this.peers.get(fromPubkey);
    if (!entry) return;
    try {
      const candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch { /* ignore stale candidates */ }
  }

  handleViewerLeft(viewerPubkey: string) {
    const entry = this.peers.get(viewerPubkey);
    if (!entry) return;
    entry.pc.close();
    this.peers.delete(viewerPubkey);
  }

  stop() {
    for (const { pc } of this.peers.values()) pc.close();
    this.peers.clear();
    for (const track of this.localStream.getTracks()) track.stop();
  }
}

export class WebRtcViewerSession {
  private pc: RTCPeerConnection;
  private streamId: string;
  private sharerPubkey: string;
  private handlers: WebRtcViewerHandlers;
  private iceServers: RTCIceServer[];

  constructor(streamId: string, sharerPubkey: string, handlers: WebRtcViewerHandlers, turnUrl?: string) {
    this.streamId = streamId;
    this.sharerPubkey = sharerPubkey;
    this.handlers = handlers;
    this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    if (turnUrl) this.iceServers.push({ urls: turnUrl });

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    const remoteStream = new MediaStream();

    this.pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? [e.track]) {
        remoteStream.addTrack(track);
      }
      handlers.onRemoteStream(streamId, remoteStream);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        handlers.onSendIce(sharerPubkey, streamId, JSON.stringify(e.candidate.toJSON()));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "disconnected" || this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
        handlers.onDisconnected(streamId);
      }
    };
  }

  async handleOffer(sdp: string) {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.handlers.onSendAnswer(this.sharerPubkey, this.streamId, answer.sdp ?? "");
  }

  async handleIce(candidateJson: string) {
    try {
      const candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch { /* ignore stale candidates */ }
  }

  stop() {
    this.pc.close();
  }
}

export function isWebRtcAvailable(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}
