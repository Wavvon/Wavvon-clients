import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Channel } from "@wavvon/core";
import { ChannelHeader } from "../content/ChannelHeader";

const noop = () => {};

function headerFor(channel_type: string) {
  const channel = { id: "c1", name: "Lobby", channel_type, parent_id: null } as unknown as Channel;
  return renderToStaticMarkup(
    <ChannelHeader
      selectedChannel={channel}
      channels={[channel]}
      memberSidebarHidden={false}
      searchOpen={false}
      searchQuery=""
      searchResults={null}
      isAdmin={false}
      onShowPinned={noop}
      onToggleSearch={noop}
      onCloseSearch={noop}
      onSetSearchQuery={noop}
      onToggleMemberSidebar={noop}
      onOpenEditDescription={noop}
      onBreadcrumbCategoryClick={noop}
    />,
  );
}

describe("ChannelHeader", () => {
  it("gives a voice channel the voice icon, not the text channel's '#'", () => {
    const html = headerFor("voice");
    expect(html).not.toContain("channel-type-hash");
    expect(html).not.toMatch(/#\s*Lobby/);
  });

  it("keeps '#' for a text channel", () => {
    expect(headerFor("text")).toContain("channel-type-hash");
  });
});
