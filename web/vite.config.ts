import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Force Rollup to resolve these from the project's own node_modules,
      // not from ../i18n/ where they don't exist.
      "i18next": resolve(__dirname, "node_modules/i18next"),
      "react-i18next": resolve(__dirname, "node_modules/react-i18next"),
      "i18next-icu": resolve(__dirname, "node_modules/i18next-icu"),
      "@components": resolve(__dirname, "src/components"),
      "@shared/types": resolve(__dirname, "src/types.ts"),
      "@shared/utils": resolve(__dirname, "src/utils"),
      "@shared/hooks": resolve(__dirname, "src/hooks"),
      "@shared/constants": resolve(__dirname, "src/constants.ts"),
      "@platform": resolve(__dirname, "src/platform/index.ts"),
      "@identity": resolve(__dirname, "src/identity"),
      "@voxply/i18n": resolve(__dirname, "../i18n/index.ts"),
    },
  },
  server: {
    port: 1421,
  },
});
