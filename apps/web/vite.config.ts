/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";

export default defineConfig({
  plugins: [react(), mediapipeAssets()],
  optimizeDeps: {
    include: ["opusscript"],
    exclude: ["@mediapipe/selfie_segmentation"],
  },
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@components": resolve(__dirname, "src/components"),
      "@shared/types": resolve(__dirname, "src/types.ts"),
      "@shared/utils": resolve(__dirname, "src/utils"),
      "@shared/hooks": resolve(__dirname, "src/hooks"),
      "@shared/constants": resolve(__dirname, "src/constants.ts"),
      "@platform": resolve(__dirname, "src/platform/index.ts"),
      "@identity": resolve(__dirname, "src/identity"),
    },
  },
  server: {
    port: 1421,
  },
  test: {
    // Playwright specs live under e2e/ and must not be collected by vitest
    // (they call @playwright/test's test() which throws outside its runner).
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
