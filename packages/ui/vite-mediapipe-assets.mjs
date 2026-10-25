import { createRequire } from "module";
import { dirname, join } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";

// Serve the MediaPipe selfie-segmentation model + WASM from /mediapipe/* so the
// webcam background effects run fully self-hosted (offline-friendly, no CDN).
// Dev: middleware streams the files from node_modules; build: emits them to
// dist/mediapipe/. Kept out of git — sourced from the installed package.
//
// One copy, imported by both apps' vite.config.ts. It was duplicated
// line-for-line, comments included (Wavvon-clients#61), and both apps already
// depend on @mediapipe/selfie_segmentation.
//
// Plain .mjs rather than TypeScript: a Vite config loads this before any build
// step could compile it, and the plugin object is structurally typed by Vite
// at the call site anyway.
export function mediapipeAssets() {
  const require = createRequire(import.meta.url);
  let dir = "";
  try {
    dir = dirname(require.resolve("@mediapipe/selfie_segmentation/package.json"));
  } catch {
    /* not installed */
  }
  const files =
    dir && existsSync(dir)
      ? readdirSync(dir).filter(
          (f) => /\.(wasm|data|tflite|binarypb)$/.test(f) || /_solution_.*wasm_bin\.js$/.test(f),
        )
      : [];
  const ctype = (f) =>
    f.endsWith(".wasm")
      ? "application/wasm"
      : f.endsWith(".js")
        ? "text/javascript"
        : "application/octet-stream";
  return {
    name: "mediapipe-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/mediapipe\/([^?]+)$/);
        if (m && files.includes(m[1])) {
          res.setHeader("Content-Type", ctype(m[1]));
          res.end(readFileSync(join(dir, m[1])));
          return;
        }
        next();
      });
    },
    generateBundle() {
      for (const f of files) {
        this.emitFile({
          type: "asset",
          fileName: `mediapipe/${f}`,
          source: readFileSync(join(dir, f)),
        });
      }
    },
  };
}
