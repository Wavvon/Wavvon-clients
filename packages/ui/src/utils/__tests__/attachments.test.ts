import { describe, expect, it } from "vitest";
import { needsDownloadWarning } from "../attachments";

describe("needsDownloadWarning", () => {
  it("flags executables and svg, case-insensitively, by the last extension", () => {
    expect(needsDownloadWarning("setup.EXE")).toBe(true);
    expect(needsDownloadWarning("logo.svg")).toBe(true);
    expect(needsDownloadWarning("archive.tar.sh")).toBe(true);
  });

  it("leaves ordinary files alone", () => {
    expect(needsDownloadWarning("photo.jpg")).toBe(false);
    expect(needsDownloadWarning("notes")).toBe(false);
    expect(needsDownloadWarning("exe")).toBe(false);
  });
});
