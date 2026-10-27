import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const appVersion = JSON.parse(readFileSync(resolve(__dirname, "src-tauri/tauri.conf.json"), "utf8")).version;

export default defineConfig({
  plugins: [react(), mediapipeAssets()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  optimizeDeps: {
    exclude: ["@mediapipe/selfie_segmentation"],
  },
  assetsInclude: ["**/*.wasm"],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pip: resolve(__dirname, "pip.html"),
      },
    },
  },
});
