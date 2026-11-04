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
  // The policy a hub serves its web client under (HTML_CSP in Wavvon-server's
  // crates/hub/src/web_client.rs, minus the hash of the one inline script the
  // hub injects). CI's live suite runs against `vite preview`, so this is what
  // makes every live spec run under the hub's CSP: voice shipped broken once
  // because nothing did.
  preview: {
    headers: {
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data: https: http:; media-src 'self' blob: https: http:; font-src 'self' data:; connect-src 'self' https: wss: http: ws:; worker-src 'self' blob:; frame-src 'self' https:; manifest-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  },
  test: {
    // Playwright specs live under e2e/ and must not be collected by vitest
    // (they call @playwright/test's test() which throws outside its runner).
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
