import { FrameAccumulator } from './captureFraming';

declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private acc = new FrameAccumulator();
  private out: MessagePort | null = null;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ pcmPort: MessagePort }>) => {
      this.out = e.data.pcmPort;
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
