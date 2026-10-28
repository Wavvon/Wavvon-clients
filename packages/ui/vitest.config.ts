import { defineConfig } from "vitest/config";

// The apps compile JSX with the automatic runtime, so a component need not
// import React; the tests have to as well, or such a component cannot render.
export default defineConfig({ esbuild: { jsx: "automatic" } });
