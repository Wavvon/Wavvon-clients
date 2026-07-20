import { describe, it, expect } from "vitest";
import { passphraseStrength } from "../passphraseStrength";

describe("passphraseStrength", () => {
  it("rates short passphrases weak", () => {
    expect(passphraseStrength("")).toBe("weak");
    expect(passphraseStrength("short12")).toBe("weak");
  });

  it("rates mid-length passphrases fair", () => {
    expect(passphraseStrength("eight2go!")).toBe("fair");
    expect(passphraseStrength("thirteenchars")).toBe("fair");
  });

  it("rates long passphrases strong", () => {
    expect(passphraseStrength("correct horse battery staple")).toBe("strong");
    expect(passphraseStrength("fourteencharsxx")).toBe("strong");
  });
});
