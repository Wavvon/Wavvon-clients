import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddHubModal } from "../hubs/AddHubModal";

// This package has no vite config, so vitest compiles JSX with the classic
// runtime, and AddHubModal (unlike the components that import React) needs
// the global it would otherwise get from the automatic one.
(globalThis as { React?: typeof React }).React = React;

// i18next is not initialised here, so t() answers with the key itself.
const HINT = "hub.invite_only_hint";

function render(hubUrl: string) {
  return renderToStaticMarkup(
    <AddHubModal
      hubUrl={hubUrl}
      onHubUrlChange={() => {}}
      hubPreview={{ state: "ok", url: "https://hub.example", name: "Hub", invite_only: true }}
      loading={false}
      error={null}
      onAdd={() => {}}
      onClose={() => {}}
    />,
  );
}

describe("AddHubModal invite-only hint", () => {
  it("asks for an invite link when the address has none", () => {
    expect(render("hub.example")).toContain(HINT);
  });

  it("stays quiet once the address already carries the invite", () => {
    expect(render("https://hub.example/join/abc123")).not.toContain(HINT);
  });
});
