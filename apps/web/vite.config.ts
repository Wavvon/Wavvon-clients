/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync } from "fs";
import { mediapipeAssets } from "@wavvon/ui/vite-mediapipe-assets";

// One version for both clients: the desktop's tauri.conf.json is the source
// the release bumps, and apps/web/package.json is not kept in step with it.
const appVersion = JSON.parse(readFileSync(resolve(__dirname, "../desktop/src-tauri/tauri.conf.json"), "utf8")).version;

// The policy a hub serves its web client under (HTML_CSP in Wavvon-server's
// crates/hub/src/web_client.rs, minus the hash of the one inline script the
// hub injects). CI's live suite runs against `vite preview`, so this is what
// makes every live spec run under the hub's CSP: voice shipped broken once
// because nothing did.
const HUB_CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data: https: http:; media-src 'self' blob: https: http:; font-src 'self' data:; connect-src 'self' https: wss: http: ws:; worker-src 'self' blob:; frame-src 'self' https:; manifest-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";

// The Cloudflare Pages pilot (VITE_CHANNEL=pilot, decisions.md 2026-11-11) is
// not served by a hub, so it gets the same policy from a `_headers` file,
// which Pages applies to every response.
function pilotHeaders(): Plugin {
  return {
    name: "wavvon-pilot-headers",
    apply: "build",
    generateBundle() {
      if (process.env.VITE_CHANNEL !== "pilot") return;
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `/*\n  Content-Security-Policy: ${HUB_CSP}\n`,
      });
    },
  };
}

// GitHub Pages cannot send headers, so the nightly (VITE_CHANNEL=nightly)
// carries the policy in a meta tag. frame-ancestors is dropped: browsers
// ignore it in a meta tag and log an error for it.
function nightlyMetaCsp(): Plugin {
  return {
    name: "wavvon-nightly-meta-csp",
    apply: "build",
    transformIndexHtml() {
      if (process.env.VITE_CHANNEL !== "nightly") return;
      const policy = HUB_CSP.replace(/; frame-ancestors [^;]+/, "");
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), mediapipeAssets(), pilotHeaders(), nightlyMetaCsp()],
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
  preview: {
    headers: {
      "Content-Security-Policy": HUB_CSP,
    },
  },
  test: {
    // Playwright specs live under e2e/ and must not be collected by vitest
    // (they call @playwright/test's test() which throws outside its runner).
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
