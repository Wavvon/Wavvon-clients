import { describe, it, expect } from "vitest";
import { homeHubStatus } from "../homeHubStatus";

const LIST = ["https://a.example", "https://b.example"];

describe("homeHubStatus", () => {
  it("finds the hub in the list", () => {
    expect(homeHubStatus(LIST, "https://a.example")).toEqual({ isHomeHub: true, isLast: false });
    expect(homeHubStatus(LIST, "https://c.example")).toEqual({ isHomeHub: false, isLast: false });
  });

  // The failure this exists for: the dialog stays silent about a home hub
  // because one side of the comparison had a trailing slash. Nothing else
  // would mention that the hub keeps receiving the user's DMs.
  it("ignores a trailing slash on either side", () => {
    expect(homeHubStatus(LIST, "https://a.example/").isHomeHub).toBe(true);
    expect(homeHubStatus(["https://a.example/"], "https://a.example").isHomeHub).toBe(true);
    expect(homeHubStatus(["https://a.example//"], "https://a.example/").isHomeHub).toBe(true);
  });

  it("reports the only entry as last, and never a non-member as last", () => {
    expect(homeHubStatus(["https://a.example"], "https://a.example")).toEqual({
      isHomeHub: true,
      isLast: true,
    });
    expect(homeHubStatus(["https://a.example"], "https://b.example").isLast).toBe(false);
  });

  it("treats a deliberately emptied list as no home hub at all", () => {
    expect(homeHubStatus([], "https://a.example")).toEqual({ isHomeHub: false, isLast: false });
  });

  it("says nothing for a hub with no address", () => {
    expect(homeHubStatus(LIST, "")).toEqual({ isHomeHub: false, isLast: false });
  });
});
