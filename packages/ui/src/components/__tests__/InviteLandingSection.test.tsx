import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteLandingSection } from "../admin/InviteLandingSection";
import { landingBackdrop } from "../layout/OnboardingFrame";

const actions = {
  load: () => new Promise<never>(() => {}),
  saveImage: async () => {},
  saveColors: async () => {},
};

describe("landingBackdrop", () => {
  it("prefers the image over the colours", () => {
    expect(landingBackdrop("https://hub/img", ["#000000", "#ffffff"])).toEqual({ backgroundImage: 'url("https://hub/img")' });
  });

  it("falls back to the two colours", () => {
    expect(landingBackdrop(null, ["#112233", "#445566"])).toEqual({
      backgroundImage: "linear-gradient(135deg, #112233, #445566)",
    });
  });

  it("paints nothing when neither is set", () => {
    expect(landingBackdrop(null, null)).toBeUndefined();
  });
});

// The admin edits the identity on the landing itself: name and description
// must be the inputs, laid out as the invite page lays them out.
describe("InviteLandingSection", () => {
  const html = renderToStaticMarkup(
    <InviteLandingSection
      name="Videogamezone"
      description="Tornei e LFG"
      onNameChange={() => {}}
      onDescriptionChange={() => {}}
      memberCount={220}
      actions={actions}
    />,
  );

  it("edits name and description on the preview", () => {
    expect(html).toContain('value="Videogamezone"');
    expect(html).toContain("Tornei e LFG</textarea>");
    expect(html).toContain("onboarding.frame.invited");
  });

  it("offers an image and two colours for the background", () => {
    expect(html).toContain("hub.admin.landing.image_pick");
    expect(html.match(/type="color"/g)).toHaveLength(2);
  });
});
