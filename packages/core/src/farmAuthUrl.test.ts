import { describe, expect, it } from "vitest";
import { farmAuthUrl } from "./farmAuthUrl";

describe("farmAuthUrl", () => {
  it("follows a farm on the hub's own origin", () => {
    expect(farmAuthUrl("https://farm.example", "https://farm.example/hub/games")).toBe("https://farm.example");
  });

  it("ignores a farm_url anywhere else, and a missing one", () => {
    expect(farmAuthUrl("https://other-farm.example", "https://hub.example")).toBe("https://hub.example");
    expect(farmAuthUrl("http://farm.example", "https://farm.example/hub/x")).toBe("https://farm.example/hub/x");
    expect(farmAuthUrl(null, "https://hub.example")).toBe("https://hub.example");
    expect(farmAuthUrl("not a url", "https://hub.example")).toBe("https://hub.example");
  });
});
