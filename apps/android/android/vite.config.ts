import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@components": resolve(__dirname, "../voxply-desktop/src/components"),
      "@shared/types": resolve(__dirname, "../voxply-desktop/src/types.ts"),
      "@shared/utils": resolve(__dirname, "../voxply-desktop/src/utils"),
      "@shared/hooks": resolve(__dirname, "../voxply-desktop/src/hooks"),
      "@shared/constants": resolve(__dirname, "../voxply-desktop/src/constants.ts"),
      "@platform": resolve(__dirname, "../voxply-web/src/platform/index.ts"),
      "@identity": resolve(__dirname, "../voxply-web/src/identity"),
      "@voxply/i18n": resolve(__dirname, "../voxply-web/i18n/index.ts"),
      "@voxply/utils": resolve(__dirname, "../voxply-web/utils/index.ts"),
    },
  },
  server: {
    port: 1422,
  },
});
