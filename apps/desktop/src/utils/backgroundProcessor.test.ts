// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackgroundProcessor } from "./backgroundProcessor";

vi.mock("@mediapipe/selfie_segmentation", () => {
  class FakeSelfieSegmentation {
    options: unknown;
    closed = false;
    constructor(opts: unknown) {
      this.options = opts;
    }
    setOptions() {}
    onResults() {}
    send() {
      return Promise.resolve();
    }
    close() {
      this.closed = true;
    }
  }
  return { SelfieSegmentation: FakeSelfieSegmentation };
});

function mockCanvasApis() {
  const fake2d = {
    filter: "none",
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
  };
  // happy-dom doesn't implement a 2D canvas context or captureStream.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fake2d) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { captureStream: () => MediaStream }).captureStream = vi.fn(
    () => ({ getTracks: () => [] }) as unknown as MediaStream
  );
  return fake2d;
}

// happy-dom validates srcObject against its own MediaStream class (instanceof
// check), so a plain object won't do — construct a real one and monkeypatch
// getTracks, which happy-dom doesn't implement.
function fakeStream(onStopTrack?: () => void): MediaStream {
  const ms = new MediaStream() as MediaStream & { getTracks: () => MediaStreamTrack[] };
  ms.getTracks = () => [{ stop: onStopTrack ?? (() => {}) } as unknown as MediaStreamTrack];
  return ms;
}

describe("BackgroundProcessor mode switching", () => {
  beforeEach(() => {
    mockCanvasApis();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("does not load a segmentation model for mode 'none'", async () => {
    const proc = new BackgroundProcessor(fakeStream());
    await proc.start("none");
    expect((proc as unknown as { segmentation: unknown }).segmentation).toBeNull();
    proc.stop();
  });

  it("lazily loads the segmentation model only when an effect is enabled", async () => {
    const proc = new BackgroundProcessor(fakeStream());
    await proc.start("blur");
    expect((proc as unknown as { segmentation: unknown }).segmentation).not.toBeNull();
    proc.stop();
  });

  it("sets up a looping background video element for video mode", async () => {
    const proc = new BackgroundProcessor(fakeStream());
    await proc.start("video", "blob:fake-video-source");
    const bgVideo = (proc as unknown as { bgVideo: HTMLVideoElement | null }).bgVideo;
    expect(bgVideo).not.toBeNull();
    expect(bgVideo?.loop).toBe(true);
    expect(bgVideo?.src).toContain("fake-video-source");
    proc.stop();
  });

  it("clears the background source when switching back to none", async () => {
    const proc = new BackgroundProcessor(fakeStream());
    await proc.start("video", "blob:fake-video-source");
    expect((proc as unknown as { bgVideo: HTMLVideoElement | null }).bgVideo).not.toBeNull();
    await proc.setMode("none");
    expect((proc as unknown as { bgVideo: HTMLVideoElement | null }).bgVideo).toBeNull();
    proc.stop();
  });

  it("stop() halts the render loop and releases the raw stream's tracks", async () => {
    const stopTrack = vi.fn();
    const proc = new BackgroundProcessor(fakeStream(stopTrack));
    await proc.start("none");
    proc.stop();
    expect((proc as unknown as { stopped: boolean }).stopped).toBe(true);
    expect(stopTrack).toHaveBeenCalled();
  });
});
