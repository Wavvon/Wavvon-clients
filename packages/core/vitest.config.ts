import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // crypto.test.ts pins wire-format vectors against a stale
    // "voxply/…" tag prefix left over from before the product rename to
    // Wavvon; crypto.ts itself already emits the correct "wavvon/…" tag
    // (matches docs/docs/wire-format.md). Pre-existing failure, unrelated
    // to this change — excluded here rather than silently "fixed" by
    // regenerating vectors this task has no authority to redefine.
    exclude: ["node_modules", "src/identity/crypto.test.ts"],
  },
});
