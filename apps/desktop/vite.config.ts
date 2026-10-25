import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";
import { resolve } from "node:path";

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
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pip: resolve(__dirname, "pip.html"),
      },
    },
  },
});
