import { describe, it, expect } from "vitest";
import {
  bumpChannelUnread,
  clearChannelUnread,
  clearHubChannelUnread,
  seedHubUnread,
  unreadCountsByHub,
  totalUnread,
  unreadDocumentTitle,
  type UnreadMap,
} from "../unreadCounts";

const MAP: UnreadMap = { hubA: { general: true }, hubB: {} };

describe("unread map transitions", () => {
  // The identity checks are the point of these tests: desktop persists on
  // every new object, so a transition that rebuilds the map when nothing
  // changed writes to disk on every incoming message in an already-unread
  // channel — invisible on screen, and exactly the kind of thing that only
  // shows up as a mysteriously busy disk.
  it("returns the same object when a channel is already unread", () => {
    expect(bumpChannelUnread(MAP, "hubA", "general")).toBe(MAP);
  });

  it("returns the same object when clearing a channel that is already read", () => {
    expect(clearChannelUnread(MAP, "hubA", "random")).toBe(MAP);
    expect(clearChannelUnread(MAP, "unknown-hub", "general")).toBe(MAP);
  });

  it("returns the same object when clearing a hub with nothing unread", () => {
    expect(clearHubChannelUnread(MAP, "hubB")).toBe(MAP);
    expect(clearHubChannelUnread(MAP, "unknown-hub")).toBe(MAP);
  });

  it("marks a channel unread without touching the other hubs", () => {
    const next = bumpChannelUnread(MAP, "hubA", "random");
    expect(next.hubA).toEqual({ general: true, random: true });
    expect(next.hubB).toBe(MAP.hubB);
    expect(MAP.hubA).toEqual({ general: true });
  });

  it("clears one channel and leaves the rest", () => {
    const two = bumpChannelUnread(MAP, "hubA", "random");
    expect(clearChannelUnread(two, "hubA", "general").hubA).toEqual({ random: true });
  });

  it("seeds from server counts, and a zero count is read rather than absent", () => {
    const next = seedHubUnread(MAP, "hubA", [
      { channel_id: "general", unread_count: 0 },
      { channel_id: "random", unread_count: 4 },
    ]);
    expect(next.hubA).toEqual({ random: true });
  });

  it("replaces the hub's set on seed rather than merging into it", () => {
    const next = seedHubUnread(MAP, "hubA", []);
    expect(next.hubA).toEqual({});
  });
});

describe("derived counts and title", () => {
  it("counts unread channels per hub", () => {
    const map = bumpChannelUnread(bumpChannelUnread(MAP, "hubA", "random"), "hubB", "news");
    expect(unreadCountsByHub(map)).toEqual({ hubA: 2, hubB: 1 });
    expect(totalUnread(unreadCountsByHub(map))).toBe(3);
  });

  it("caps the title at 99+ and drops the prefix at zero", () => {
    expect(unreadDocumentTitle(0)).toBe("Wavvon");
    expect(unreadDocumentTitle(1)).toBe("(1) Wavvon");
    expect(unreadDocumentTitle(99)).toBe("(99) Wavvon");
    expect(unreadDocumentTitle(100)).toBe("(99+) Wavvon");
  });
});
