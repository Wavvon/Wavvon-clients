import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";

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
