export type BackgroundMode = "none" | "blur" | "image" | "video";

// Runs the webcam through MediaPipe selfie segmentation and composites the
// person over a blurred / image / video background, returning a processed
// MediaStream (canvas.captureStream). The model + WASM are served locally
// from /mediapipe/* (see the mediapipeAssets Vite plugin), so no CDN.
export class BackgroundProcessor {
  private rawStream: MediaStream;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private outputStream: MediaStream | null = null;
  private rafId = 0;
  private mode: BackgroundMode = "none";
  private bgImage: HTMLImageElement | null = null;
  private bgVideo: HTMLVideoElement | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private segmentation: any = null;
  private mask: ImageData | null = null;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;
  private stopped = false;

  constructor(stream: MediaStream) {
    this.rawStream = stream;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext("2d")!;
    this.tempCanvas = document.createElement("canvas");
    this.tempCanvas.width = 640;
    this.tempCanvas.height = 480;
    this.tempCtx = this.tempCanvas.getContext("2d")!;
    this.video = document.createElement("video");
    this.video.srcObject = stream;
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start(mode: BackgroundMode, source?: string | null): Promise<MediaStream> {
    this.mode = mode;
    if (mode !== "none") await this.ensureSegmentation();
    await this.setBackgroundSource(mode, source);
    // captureStream is only available on the canvas element in browsers.
    this.outputStream = this.canvas.captureStream(30);
    void this.video.play().catch(() => {});
    this.loop();
    return this.outputStream;
  }

  private async ensureSegmentation(): Promise<void> {
    if (this.segmentation) return;
    try {
      // Lazy-load the model only when effects are turned on.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("@mediapipe/selfie_segmentation")) as any;
      const SelfieSegmentation = mod.SelfieSegmentation ?? mod.default?.SelfieSegmentation;
      this.segmentation = new SelfieSegmentation({
        locateFile: (file: string) => `/mediapipe/${file}`,
      });
      this.segmentation.setOptions({ modelSelection: 1 });
      this.segmentation.onResults((results: { segmentationMask: ImageData }) => {
        this.mask = results.segmentationMask;
      });
    } catch {
      // Segmentation unavailable (e.g. WASM blocked) — fall back to raw video.
      this.segmentation = null;
      this.mode = "none";
    }
  }

  private async setBackgroundSource(mode: BackgroundMode, source?: string | null): Promise<void> {
    this.bgImage = null;
    this.bgVideo?.pause();
    this.bgVideo = null;
    if (mode === "image" && source) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = source;
      await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
      this.bgImage = img;
    } else if (mode === "video" && source) {
      const v = document.createElement("video");
      v.src = source;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      await v.play().catch(() => {});
      this.bgVideo = v;
    }
  }

  private loop = () => {
    if (this.stopped) return;
    if (this.video.readyState >= 2) this.drawFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private drawFrame() {
    const { width, height } = this.canvas;

    // No effect (or segmentation not ready yet): pass the raw frame through,
    // but keep feeding the segmenter so the mask warms up.
    if (this.mode === "none" || !this.segmentation || !this.mask) {
      this.ctx.filter = "none";
      this.ctx.drawImage(this.video, 0, 0, width, height);
      if (this.segmentation) this.segmentation.send({ image: this.video }).catch(() => {});
      return;
    }

    // Paint the background layer.
    if (this.mode === "blur") {
      this.ctx.filter = "blur(12px)";
      this.ctx.drawImage(this.video, 0, 0, width, height);
      this.ctx.filter = "none";
    } else if (this.mode === "image" && this.bgImage) {
      this.ctx.drawImage(this.bgImage, 0, 0, width, height);
    } else if (this.mode === "video" && this.bgVideo && this.bgVideo.readyState >= 2) {
      this.ctx.drawImage(this.bgVideo, 0, 0, width, height);
    } else {
      // Source missing — degrade to a blurred background rather than nothing.
      this.ctx.filter = "blur(12px)";
      this.ctx.drawImage(this.video, 0, 0, width, height);
      this.ctx.filter = "none";
    }

    // Cut out the person using the mask alpha and draw them over the background.
    this.tempCtx.clearRect(0, 0, width, height);
    this.tempCtx.drawImage(this.video, 0, 0, width, height);
    const frame = this.tempCtx.getImageData(0, 0, width, height);
    const maskData = this.mask.data;
    for (let i = 0; i < frame.data.length; i += 4) {
      const alpha = maskData[(i / 4) * 4 + 3] ?? 0;
      if (alpha < 128) frame.data[i + 3] = 0;
    }
    this.tempCtx.putImageData(frame, 0, 0);
    this.ctx.drawImage(this.tempCanvas, 0, 0);

    this.segmentation.send({ image: this.video }).catch(() => {});
  }

  /** Change effect live without recreating the stream. */
  async setMode(mode: BackgroundMode, source?: string | null): Promise<void> {
    if (mode !== "none") await this.ensureSegmentation();
    await this.setBackgroundSource(mode, source);
    this.mode = this.segmentation || mode === "none" ? mode : "none";
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    this.bgVideo?.pause();
    this.bgVideo = null;
    if (this.segmentation?.close) { try { this.segmentation.close(); } catch { /* ignore */ } }
    this.segmentation = null;
    this.rawStream.getTracks().forEach((t) => t.stop());
    this.outputStream?.getTracks().forEach((t) => t.stop());
  }
}
