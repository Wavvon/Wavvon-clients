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
  // MediaPipe's segmentationMask is a GpuBuffer (canvas/bitmap) meant for
  // drawImage compositing — it has no pixel array.
  private mask: CanvasImageSource | null = null;
  private sending = false;
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
      // Lazy-load the model only when effects are turned on. The package is a
      // Closure-compiled IIFE with no module exports — importing it runs the
      // script, which registers SelfieSegmentation on globalThis; that global
      // is the only reliable way to reach the constructor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("@mediapipe/selfie_segmentation")) as any;
      const SelfieSegmentation =
        mod.SelfieSegmentation ??
        mod.default?.SelfieSegmentation ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).SelfieSegmentation;
      const seg = new SelfieSegmentation({
        locateFile: (file: string) => `/mediapipe/${file}`,
      });
      seg.setOptions({ modelSelection: 1 });
      seg.onResults((results: { segmentationMask: CanvasImageSource }) => {
        this.mask = results.segmentationMask;
      });
      // Force the WASM + model load now so a broken environment lands in the
      // catch (raw-video fallback) instead of silently never producing a mask.
      await seg.initialize();
      this.segmentation = seg;
    } catch {
      // Segmentation unavailable (e.g. WASM blocked) — fall back to raw video.
      this.segmentation = null;
      this.mode = "none";
    }
  }

  /** The mode actually in effect — "none" when segmentation failed to load. */
  get activeMode(): BackgroundMode {
    return this.segmentation ? this.mode : "none";
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

    // Feed the segmenter with at most one frame in flight — MediaPipe's
    // send() is async and must not be re-entered while processing.
    if (this.mode !== "none" && this.segmentation && !this.sending) {
      this.sending = true;
      (this.segmentation.send({ image: this.video }) as Promise<void>)
        .catch(() => {})
        .finally(() => { this.sending = false; });
    }

    // No effect (or the first mask hasn't arrived yet): raw passthrough.
    if (this.mode === "none" || !this.segmentation || !this.mask) {
      this.ctx.filter = "none";
      this.ctx.drawImage(this.video, 0, 0, width, height);
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

    // Person cutout: the mask is opaque where the person is, so drawing it
    // and then the camera frame with source-in keeps only the person pixels;
    // the result goes over the background layer.
    this.tempCtx.clearRect(0, 0, width, height);
    this.tempCtx.drawImage(this.mask, 0, 0, width, height);
    this.tempCtx.globalCompositeOperation = "source-in";
    this.tempCtx.drawImage(this.video, 0, 0, width, height);
    this.tempCtx.globalCompositeOperation = "source-over";
    this.ctx.drawImage(this.tempCanvas, 0, 0);
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
