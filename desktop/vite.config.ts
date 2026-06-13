import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Pin i18next packages to this project's node_modules so Rollup
      // resolves them correctly when bundling files from ../../web/i18n/.
      "i18next": resolve(__dirname, "node_modules/i18next"),
      "react-i18next": resolve(__dirname, "node_modules/react-i18next"),
      "i18next-icu": resolve(__dirname, "node_modules/i18next-icu"),
      "@voxply/i18n": resolve(__dirname, "../../web/i18n/index.ts"),
    },
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port
  server: {
    port: 1420,
    strictPort: true,
  },
});
