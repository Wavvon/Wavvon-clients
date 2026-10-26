/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync } from "fs";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";

// One version for both clients: the desktop's tauri.conf.json is the source
// the release bumps, and apps/web/package.json is not kept in step with it.
const appVersion = JSON.parse(readFileSync(resolve(__dirname, "../desktop/src-tauri/tauri.conf.json"), "utf8")).version;

export default defineConfig({
  plugins: [react(), mediapipeAssets()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
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
