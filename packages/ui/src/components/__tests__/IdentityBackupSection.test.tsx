import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentityBackupSection } from "../IdentityBackupSection";

// A paired device's seed is its own subkey: shown as 24 words it would read as
// the recovery phrase and restore a different identity.
describe("IdentityBackupSection on a paired device", () => {
  const render = (phraseHeldElsewhere: boolean) =>
    renderToStaticMarkup(
      <IdentityBackupSection
        accounts={[]}
        recoveryPhrase={null}
        onRevealPhrase={() => {}}
        actions={{}}
        phraseHeldElsewhere={phraseHeldElsewhere}
      />,
    );

  it("offers no phrase to reveal", () => {
    expect(render(true)).not.toContain("settings.security.recovery.reveal");
    expect(render(true)).toContain("settings.security.recovery.paired_device");
  });

  it("still offers it on the device holding the master seed", () => {
    expect(render(false)).toContain("settings.security.recovery.reveal");
  });
});
