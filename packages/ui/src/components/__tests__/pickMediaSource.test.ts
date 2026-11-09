import { describe, it, expect } from "vitest";
import { documentPictureInPicture, pickMediaSource } from "../ScreenShareViewer";

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

describe("documentPictureInPicture", () => {
  it("finds the entry point where the browser has one", () => {
    const api = { requestWindow: async () => ({}) as Window };
    expect(documentPictureInPicture({ documentPictureInPicture: api })).toBe(api);
  });

  it("answers null in Safari and on mobile, where the single-video PiP remains", () => {
    expect(documentPictureInPicture({})).toBeNull();
  });
});
