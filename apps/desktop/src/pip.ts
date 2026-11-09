import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import "./pip.css";

(async () => {

  const video = document.getElementById("video") as HTMLVideoElement;
  const placeholder = document.getElementById("placeholder") as HTMLElement;
  const closeBtn = document.getElementById("close-btn") as HTMLElement;
  const clickThroughBtn = document.getElementById("click-through-btn") as HTMLElement;
  const opacity = document.getElementById("opacity") as HTMLInputElement;
  // Each floating window carries the stream it shows, so several can be open
  // at once and each hears only its own events.
  const key = new URLSearchParams(location.search).get("key") ?? "";
  const storedOpacity = (() => {
    try { return localStorage.getItem("wavvon:pip-opacity"); } catch { return null; }
  })();
  if (storedOpacity) opacity.value = storedOpacity;
  document.body.style.opacity = opacity.value;
  opacity.addEventListener("input", () => {
    document.body.style.opacity = opacity.value;
    try { localStorage.setItem("wavvon:pip-opacity", opacity.value); } catch { /* storage off: keep it for this window only */ }
  });
  clickThroughBtn.addEventListener("click", () => {
    void invoke("set_pip_click_through", { key, on: true });
  });

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
      try { mediaSource.endOfStream(); } catch { /* already ending: nothing to close */ }
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
      } catch {
        // No playable codec: sourceBuffer stays null, so chunks queue and never play.
      }
    }, { once: true });

    video.play().catch(() => {});
    showPlaceholder(false);
  }

  await listen<{ data: number[] }>(`pip-stream-chunk-${key}`, (event) => {
    const bytes = new Uint8Array(event.payload.data);
    if (!mediaSource || mediaSource.readyState !== "open") {
      initMse();
      queue.push(bytes.buffer);
      return;
    }
    queue.push(bytes.buffer);
    drainQueue();
  });

  await listen(`pip-stream-stop-${key}`, () => {
    resetMse();
    video.src = "";
    video.load();
    showPlaceholder(true);
  });

  closeBtn.addEventListener("click", async () => {
    await emit(`pip-close-${key}`, null);
  });
})();
