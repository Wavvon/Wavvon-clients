import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VoiceStage, type VoiceFloor } from "../content/VoiceStage";

const noop = () => {};
const floor = (over: Partial<VoiceFloor>): VoiceFloor => ({
  hands: [], maySpeak: true, canGrant: false,
  onRaise: noop, onLower: noop, onGrant: noop, onDismiss: noop,
  ...over,
});

function render(f: VoiceFloor | undefined, me = "me") {
  return renderToStaticMarkup(
    <VoiceStage
      participants={[{ public_key: "me", display_name: "Me" }, { public_key: "ann", display_name: "Ann" }]}
      speaking={new Set()}
      avatars={new Map()}
      inThisRoom
      onJoin={noop}
      publicKey={me}
      floor={f}
    />,
  );
}

describe("VoiceStage floor", () => {
  it("offers a raised hand to someone the room does not carry", () => {
    expect(render(floor({ maySpeak: false }))).toContain("voice.stage.raise_hand");
  });
  it("offers to lower it once it is up", () => {
    const html = render(floor({ maySpeak: false, hands: ["me"] }));
    expect(html).toContain("voice.stage.lower_hand");
    expect(html).not.toContain("voice.stage.raise_hand");
  });
  it("shows a moderator who is asking, with the answer", () => {
    const html = render(floor({ canGrant: true, hands: ["ann"] }));
    expect(html).toContain("voice.stage.grant");
    expect(html).toContain("voice.stage.dismiss");
  });
  it("says nothing on a hub without the floor", () => {
    expect(render(undefined)).not.toContain("voice.stage.raise_hand");
  });
});
