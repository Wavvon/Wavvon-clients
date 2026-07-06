import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, join } from "path";
import { createRequire } from "module";
import { readdirSync, readFileSync, existsSync } from "fs";

// Serve the MediaPipe selfie-segmentation model + WASM from /mediapipe/* so the
// webcam background effects run fully self-hosted (offline-friendly, no CDN).
// Dev: middleware streams the files from node_modules; build: emits them to
// dist/mediapipe/. Kept out of git — sourced from the installed package.
function mediapipeAssets(): Plugin {
  const require = createRequire(import.meta.url);
  let dir = "";
  try { dir = dirname(require.resolve("@mediapipe/selfie_segmentation/package.json")); } catch { /* not installed */ }
  const files = dir && existsSync(dir)
    ? readdirSync(dir).filter((f) => /\.(wasm|data|tflite|binarypb)$/.test(f) || /_solution_.*wasm_bin\.js$/.test(f))
    : [];
  const ctype = (f: string) => (f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".js") ? "text/javascript" : "application/octet-stream");
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
        this.emitFile({ type: "asset", fileName: `mediapipe/${f}`, source: readFileSync(join(dir, f)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeAssets()],
  optimizeDeps: {
    exclude: ["@mediapipe/selfie_segmentation"],
  },
  assetsInclude: ["**/*.wasm"],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
