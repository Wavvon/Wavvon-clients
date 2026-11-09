import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Channel } from "@wavvon/core";
import { HubStreamsPanel, liveScreenShares } from "../HubStreamsPanel";
import type { HubStreamInfo } from "../../types";

const noop = () => {};
const channels = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
] as unknown as Channel[];
const share = (channel_id: string, stream_id: string, kind: "screen" | "webcam" = "screen"): HubStreamInfo => ({
  channel_id,
  stream_id,
  sharer_pubkey: `pk-${stream_id}`,
  kind,
  mime: "video/webm",
  has_audio: false,
});

describe("HubStreamsPanel", () => {
  it("groups shares by channel in sidebar order, the current channel included, cameras left out", () => {
    const streams = [share("b", "s2"), share("a", "s1"), share("a", "cam", "webcam")];
    const html = renderToStaticMarkup(
      <HubStreamsPanel
        streams={streams}
        subscribedIds={new Set()}
        currentChannelId="a"
        channels={channels}
        nameFor={(pk) => pk}
        onWatch={noop}
        onStopWatch={noop}
        onClose={noop}
      />,
    );
    expect(html.indexOf("Alpha")).toBeGreaterThan(-1);
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Bravo"));
    expect(html).toContain("pk-s1");
    expect(html).not.toContain("pk-cam");
    expect(liveScreenShares(streams)).toHaveLength(2);
  });
});
