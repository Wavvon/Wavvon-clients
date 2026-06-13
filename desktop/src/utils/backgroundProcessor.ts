export type BackgroundMode = "none" | "blur" | "image";

export class BackgroundProcessor {
  private rawStream: MediaStream;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private outputStream: MediaStream | null = null;
  private rafId: number = 0;
  private mode: BackgroundMode = "none";
  private bgImage: HTMLImageElement | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private segmentation: any = null;
  private mask: ImageData | null = null;

  constructor(stream: MediaStream) {
    this.rawStream = stream;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext("2d")!;
    this.video = document.createElement("video");
    this.video.srcObject = stream;
    this.video.autoplay = true;
    this.video.muted = true;
  }

  async start(mode: BackgroundMode, bgImageSrc?: string | null): Promise<MediaStream> {
    this.mode = mode;

    if (mode !== "none") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation") as any;
        this.segmentation = new SelfieSegmentation({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });
        this.segmentation.setOptions({ modelSelection: 1 });
        this.segmentation.onResults((results: { segmentationMask: ImageData }) => {
          this.mask = results.segmentationMask;
        });
      } catch {
        this.mode = "none";
      }
    }

    if (mode === "image" && bgImageSrc) {
      const img = new Image();
      img.src = bgImageSrc;
      await new Promise<void>(r => { img.onload = () => r(); });
      this.bgImage = img;
    }

    this.outputStream = this.canvas.captureStream(30);
    this.loop();
    return this.outputStream;
  }

  private loop() {
    if (this.video.readyState >= 2) this.drawFrame();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private drawFrame() {
    const { width, height } = this.canvas;

    if (this.mode === "none" || !this.segmentation || !this.mask) {
      this.ctx.drawImage(this.video, 0, 0, width, height);
      if (this.segmentation) {
        this.segmentation.send({ image: this.video }).catch(() => {});
      }
      return;
    }

    if (this.mode === "blur") {
      this.ctx.filter = "blur(12px)";
      this.ctx.drawImage(this.video, 0, 0, width, height);
      this.ctx.filter = "none";
    } else if (this.mode === "image" && this.bgImage) {
      this.ctx.drawImage(this.bgImage, 0, 0, width, height);
    } else {
      this.ctx.clearRect(0, 0, width, height);
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(this.video, 0, 0, width, height);
    const frame = tempCtx.getImageData(0, 0, width, height);
    const maskData = this.mask.data;
    for (let i = 0; i < frame.data.length; i += 4) {
      const maskIdx = i / 4;
      const alpha = maskData[maskIdx * 4 + 3] ?? 0;
      if (alpha < 128) {
        frame.data[i + 3] = 0;
      }
    }
    tempCtx.putImageData(frame, 0, 0);
    this.ctx.drawImage(tempCanvas, 0, 0);

    this.segmentation.send({ image: this.video }).catch(() => {});
  }

  async setMode(mode: BackgroundMode, bgImageSrc?: string | null) {
    this.mode = mode;
    if (mode === "image" && bgImageSrc && bgImageSrc !== this.bgImage?.src) {
      const img = new Image();
      img.src = bgImageSrc;
      await new Promise<void>(r => { img.onload = () => r(); });
      this.bgImage = img;
    }
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    if (this.segmentation?.close) this.segmentation.close();
    this.rawStream.getTracks().forEach(t => t.stop());
  }
}
