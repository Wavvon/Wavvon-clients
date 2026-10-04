import { emit, listen } from "@tauri-apps/api/event";
import "./pip.css";

(async () => {

  const video = document.getElementById("video") as HTMLVideoElement;
  const placeholder = document.getElementById("placeholder") as HTMLElement;
  const closeBtn = document.getElementById("close-btn") as HTMLElement;

  let mediaSource: MediaSource | null = null;
  let sourceBuffer: SourceBuffer | null = null;
  const queue: ArrayBuffer[] = [];
  let busy = false;

  function showPlaceholder(visible: boolean) {
    placeholder.style.display = visible ? "flex" : "none";
    video.style.display = visible ? "none" : "block";
  }

  showPlaceholder(true);

  function drainQueue() {
    if (!sourceBuffer || busy || queue.length === 0) return;
    const chunk = queue.shift()!;
    busy = true;
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch {
      busy = false;
      drainQueue();
    }
  }

  function resetMse() {
    if (mediaSource && mediaSource.readyState === "open") {
      try { mediaSource.endOfStream(); } catch {}
    }
    if (video.src && video.src.startsWith("blob:")) {
      URL.revokeObjectURL(video.src);
    }
    mediaSource = null;
    sourceBuffer = null;
    queue.length = 0;
    busy = false;
  }

  function initMse() {
    resetMse();
    const ms = new MediaSource();
    mediaSource = ms;
    const objectUrl = URL.createObjectURL(ms);
    video.src = objectUrl;

    ms.addEventListener("sourceopen", () => {
      try {
        const mimeType = MediaSource.isTypeSupported("video/webm; codecs=vp9,opus")
          ? "video/webm; codecs=vp9,opus"
          : "video/webm";
        sourceBuffer = ms.addSourceBuffer(mimeType);
        sourceBuffer.addEventListener("updateend", () => {
          busy = false;
          drainQueue();
        });
      } catch {}
    }, { once: true });

    video.play().catch(() => {});
    showPlaceholder(false);
  }

  await listen<{ data: number[] }>("pip-stream-chunk", (event) => {
    const bytes = new Uint8Array(event.payload.data);
    if (!mediaSource || mediaSource.readyState !== "open") {
      initMse();
      queue.push(bytes.buffer);
      return;
    }
    queue.push(bytes.buffer);
    drainQueue();
  });

  await listen("pip-stream-stop", () => {
    resetMse();
    video.src = "";
    video.load();
    showPlaceholder(true);
  });

  closeBtn.addEventListener("click", async () => {
    await emit("pip-close", null);
  });
})();
