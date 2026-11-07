// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MobileShell } from "../MobileShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Phone width: the shell renders one panel at a time.
window.matchMedia = ((q: string) => ({
  matches: true, media: q, addEventListener() {}, removeEventListener() {},
})) as unknown as typeof window.matchMedia;

let root: Root;
let host: HTMLDivElement;

function render(props: { initialPanel?: "hub" | "channel" | "content"; hubKey?: string | null; contentKey?: string | null }) {
  act(() => {
    root.render(
      <MobileShell showHubSidebar showChannelSidebar showContent {...props}>
        <div>HUBS</div>
        <div>CHANNELS</div>
        <div>CONTENT</div>
      </MobileShell>,
    );
  });
  return host.querySelector(".mobile-shell-panel")?.textContent;
}

describe("MobileShell", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  it("starts on the panel it is told to", () => {
    expect(render({ initialPanel: "channel" })).toBe("CHANNELS");
  });

  it("moves to channels when a hub becomes active, and to content when one is opened", () => {
    expect(render({ initialPanel: "hub", hubKey: null, contentKey: null })).toBe("HUBS");
    expect(render({ initialPanel: "hub", hubKey: "hub-a", contentKey: null })).toBe("CHANNELS");
    expect(render({ initialPanel: "hub", hubKey: "hub-a", contentKey: "general" })).toBe("CONTENT");
  });

  it("lets a breadcrumb jump forward, not only back", () => {
    render({ initialPanel: "hub" });
    const crumbs = host.querySelectorAll<HTMLButtonElement>(".mobile-shell-crumb");
    act(() => { crumbs[2].click(); });
    expect(host.querySelector(".mobile-shell-panel")?.textContent).toBe("CONTENT");
  });
});
