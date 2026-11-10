import { FrameAccumulator } from './captureFraming';

declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** One processor for the page's lifetime, shared by every voice session (see
 *  sharedCaptureAudio in voice.ts). A session attaches the port its encode
 *  worker reads from and detaches it when it ends; the processor never stops. */
class CaptureProcessor extends AudioWorkletProcessor {
  private acc = new FrameAccumulator();
  private out: MessagePort | null = null;
  private outId = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ pcmPort?: MessagePort; id: number; detach?: true }>) => {
      if (e.data.pcmPort) {
        this.out?.close();
        this.out = e.data.pcmPort;
        this.outId = e.data.id;
        this.acc = new FrameAccumulator();
        return;
      }
      // A session ending after the next one attached must not detach it.
      if (e.data.detach && e.data.id === this.outId) {
        this.out?.close();
        this.out = null;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    const out = this.out;
    if (channel && out) {
      this.acc.push(channel, currentFrame, Date.now(), (frame) => out.postMessage(frame, [frame.samples.buffer]));
    }
    return true;
  }
}

registerProcessor('wavvon-capture', CaptureProcessor);
