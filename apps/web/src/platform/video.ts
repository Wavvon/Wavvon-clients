import type { HubWebSocket } from "./ws";

// Full-mesh camera video over the main hub WebSocket, wire-compatible with
// the desktop client and hub: one RTCPeerConnection per remote pubkey,
// signaled with video_offer/answer/ice (sdp as raw string, candidate as
// JSON). Media is peer-to-peer; only signaling rides the WS. Glare is
// avoided by the rule "the smaller pubkey initiates the offer".
//
// The session is created when you JOIN VOICE (not when you enable your
// camera) so it catches the `video_participants` roster the hub pushes at
// join time. It only captures + announces a camera once enable() is called;
// peer connections form only between camera-enabled participants.

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface VideoHandlers {
  onRemoteStream: (pubkey: string, stream: MediaStream) => void;
  onPeerGone: (pubkey: string) => void;
}

export class WebVideoSession {
  private peers = new Map<string, RTCPeerConnection>();
  private roster = new Set<string>(); // other camera-enabled pubkeys
  private localStream: MediaStream | null = null;
  private disposed = false;

  constructor(
    private ws: HubWebSocket,
    private channelId: string,
    private myPubkey: string,
    private handlers: VideoHandlers,
  ) {}

  private get enabled(): boolean {
    return this.localStream !== null;
  }

  // Turn our camera on: announce it and offer to every already-enabled peer
  // we outrank (smaller pubkey initiates).
  enable(localStream: MediaStream): void {
    this.localStream = localStream;
    this.ws.subscribeChannel(this.channelId);
    this.ws.sendVideoEnable(this.channelId);
    for (const pk of this.roster) {
      if (this.myPubkey < pk) void this.initiateOffer(pk);
    }
  }

  // Turn our camera off but keep tracking the roster (peers can re-form if
  // we re-enable).
  disable(): void {
    if (!this.enabled) return;
    this.ws.sendVideoDisable(this.channelId);
    for (const pk of [...this.peers.keys()]) this.closePeer(pk);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  private createPeer(remotePubkey: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.ws.sendVideoIce(this.channelId, remotePubkey, JSON.stringify(e.candidate.toJSON()));
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.handlers.onRemoteStream(remotePubkey, stream);
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        this.closePeer(remotePubkey);
      }
    };
    this.peers.set(remotePubkey, pc);
    return pc;
  }

  private async initiateOffer(remotePubkey: string): Promise<void> {
    if (this.disposed || !this.enabled || remotePubkey === this.myPubkey || this.peers.has(remotePubkey)) return;
    const pc = this.createPeer(remotePubkey);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.ws.sendVideoOffer(this.channelId, remotePubkey, offer.sdp ?? "");
  }

  private closePeer(remotePubkey: string): void {
    const pc = this.peers.get(remotePubkey);
    if (!pc) return;
    pc.close();
    this.peers.delete(remotePubkey);
    this.handlers.onPeerGone(remotePubkey);
  }

  // Dispatch an inbound video_* event (already filtered to the active hub).
  async handle(msg: Record<string, unknown>): Promise<void> {
    if (this.disposed) return;
    const type = msg.type as string;
    if (type === "video_participants") {
      this.roster = new Set(((msg.pubkeys as string[]) ?? []).filter((pk) => pk !== this.myPubkey));
      if (this.enabled) {
        for (const pk of this.roster) if (this.myPubkey < pk) await this.initiateOffer(pk);
      }
    } else if (type === "video_participant_enabled") {
      const pk = msg.pubkey as string;
      if (pk === this.myPubkey) return;
      this.roster.add(pk);
      if (this.enabled && this.myPubkey < pk) await this.initiateOffer(pk);
    } else if (type === "video_participant_disabled") {
      const pk = msg.pubkey as string;
      this.roster.delete(pk);
      this.closePeer(pk);
    } else if (type === "video_offer_in") {
      if (msg.to_pubkey !== this.myPubkey || !this.enabled) return;
      const from = msg.from_pubkey as string;
      const pc = this.peers.get(from) ?? this.createPeer(from);
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp as string });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.ws.sendVideoAnswer(this.channelId, from, answer.sdp ?? "");
    } else if (type === "video_answer_in") {
      if (msg.to_pubkey !== this.myPubkey) return;
      const pc = this.peers.get(msg.from_pubkey as string);
      if (pc) await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp as string });
    } else if (type === "video_ice_in") {
      if (msg.to_pubkey !== this.myPubkey) return;
      const pc = this.peers.get(msg.from_pubkey as string);
      if (pc) {
        try {
          await pc.addIceCandidate(JSON.parse(msg.candidate as string) as RTCIceCandidateInit);
        } catch { /* stale candidate */ }
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disable();
    this.disposed = true;
    this.roster.clear();
  }
}
