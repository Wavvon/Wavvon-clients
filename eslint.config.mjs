import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Deliberately short rather than a catalogue. This repo's habit is a handful
// of checks that each catch something that actually went wrong here — six
// custom checkers already work that way — and a linter arriving with hundreds
// of findings gets suppressed wholesale instead of read.
//
// So the split below is the point of the file, not an accident of tuning.
// An ERROR is a class that is already at zero and must stay there: it fails
// CI on the next occurrence. A WARNING is a class with a real backlog that
// nobody has walked yet; `pnpm lint` caps the count, so it can only go down,
// which is the same ratchet `check-hardcoded` uses on its baseline. Promote a
// rule once its backlog is gone — don't add one whose backlog nobody owns.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-hub/**",
      "**/node_modules/**",
      "**/target/**",
      "**/src-tauri/**",
      "**/*.config.*",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The build and check scripts: Node, not a browser.
    files: ["**/*.mjs", "**/*.js", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      // The rule this config was added for. Three security issues filed on
      // 2026-10-02 (#66, #67, #68) were one shape — a hub-controlled string
      // reaching dangerouslySetInnerHTML — and two sat in files that already
      // imported sanitizeSvgMarkup and called it a few lines away. Nothing in
      // the toolchain asked why one call site sanitized and its sibling did
      // not. Every remaining use now carries a disable comment saying where
      // its markup comes from, so the next one has to answer the same
      // question before it can land.
      "react/no-danger": "error",
      "react-hooks/rules-of-hooks": "error",

      // Both initializers it flags are deliberate and documented: a `let`
      // seeded with the safe default that the comment above it explains, then
      // overwritten in every branch. Removing the initializer would delete
      // the subject of the explanation.
      "no-useless-assignment": "off",

      // Backlogs, capped by `pnpm lint`. In rough order of what they are
      // worth: `no-empty` and `preserve-caught-error` are the "transient
      // failure read as a definitive answer" class this codebase has shipped
      // four times (see CLAUDE.md), `no-unused-vars` is mostly dead imports
      // but also found a feature built and never wired, and exhaustive-deps
      // is 48 sites of which 60 more were already suppressed by hand.
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": "warn",
      "preserve-caught-error": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/e2e/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
