import { describe, it, expect } from "vitest";
import { pickMediaSource } from "../ScreenShareViewer";

class FakeMse {}
class FakeManaged {}

describe("pickMediaSource", () => {
  it("prefers MediaSource where it exists", () => {
    expect(pickMediaSource({ MediaSource: FakeMse, ManagedMediaSource: FakeManaged })).toBe(FakeMse);
  });

  it("falls back to ManagedMediaSource, which is all an iPhone has", () => {
    expect(pickMediaSource({ ManagedMediaSource: FakeManaged })).toBe(FakeManaged);
  });

  it("answers null instead of throwing when neither exists", () => {
    expect(pickMediaSource({})).toBeNull();
  });
});
