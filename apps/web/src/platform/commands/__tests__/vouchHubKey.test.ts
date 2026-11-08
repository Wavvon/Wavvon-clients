import { describe, it, expect } from "vitest";
import { vouchHubKey } from "../hubAdmin";

describe("vouchHubKey", () => {
  it("signs the key of the hub this client is connected to", () => {
    expect(vouchHubKey("ab12", "AB12")).toBe("ab12");
  });

  it("refuses a request that names another hub, or a hub we are not on", () => {
    expect(() => vouchHubKey("ab12", "cd34")).toThrow();
    expect(() => vouchHubKey(undefined, "ab12")).toThrow();
  });
});
