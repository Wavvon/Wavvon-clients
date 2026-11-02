import { FrameAccumulator } from './captureFraming';

declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private acc = new FrameAccumulator();
  private out: MessagePort | null = null;
  private stopped = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ pcmPort?: MessagePort; stop?: true }>) => {
      if (e.data.stop) {
        this.stopped = true;
        this.out?.close();
        this.out = null;
        this.port.close();
        return;
      }
      if (e.data.pcmPort) this.out = e.data.pcmPort;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    const out = this.out;
    if (channel && out) {
      this.acc.push(channel, currentFrame, Date.now(), (frame) => out.postMessage(frame, [frame.samples.buffer]));
    }
    // Returning false is what lets Blink release the node: an active
    // processor keeps it, and its whole AudioContext, alive (clients#236).
    return !this.stopped;
  }
}

registerProcessor('wavvon-capture', CaptureProcessor);
