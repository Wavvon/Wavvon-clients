import { describe, it, expect } from "vitest";
import { sameOriginAttachmentUrl } from "../attachments";

describe("sameOriginAttachmentUrl", () => {
  it("keeps a path on the hub, including a hub served under /hub/<slug>", () => {
    expect(sameOriginAttachmentUrl("https://hub.example", "/attachments/a1")).toBe("https://hub.example/attachments/a1");
    expect(sameOriginAttachmentUrl("https://farm.example/hub/x", "/attachments/a1")).toBe("https://farm.example/hub/x/attachments/a1");
  });

  it("refuses a path that moves the host", () => {
    expect(sameOriginAttachmentUrl("https://hub.example", "@evil.example/x")).toBeNull();
    expect(sameOriginAttachmentUrl("https://hub.example", ".evil.example/x")).toBeNull();
  });
});
