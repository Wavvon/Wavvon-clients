import { describe, it, expect, beforeEach, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import i18n, { currentLanguageId, initI18n, languageOptions, setLanguage } from "@wavvon/i18n";
import { sha256Hex } from "../../themes/gallery";
import { applyHubLanguages, LANGUAGE_CHOICE_KEY } from "../hubLanguages";

const storage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

const bytes = zipSync({
  "lang.json": strToU8(JSON.stringify({ format: "wavvon.lang", version: 1, code: "sc", name: "Sardu", strings: { "modal.cancel": "Lassa" } })),
});
const served = (body: Uint8Array) => async () => new Response(body as BodyInit);

describe("hub languages", () => {
  beforeEach(async () => {
    for (const k of Object.keys(storage)) delete storage[k];
    await initI18n("en");
    await setLanguage("en");
  });

  it("offers the hub's packs and follows its default only where asked and unchosen", async () => {
    const sha = await sha256Hex(bytes);
    const info = { default: "sc", packs: [{ code: "sc", name: "Sardu", sha256: sha }] };

    await applyHubLanguages("https://hub.example", info, served(bytes), false);
    expect(languageOptions().some((o) => o.id === `hub:${sha}` && o.source === "hub")).toBe(true);
    expect(currentLanguageId()).not.toBe(`hub:${sha}`);

    await applyHubLanguages("https://hub.example", info, served(bytes), true);
    expect(currentLanguageId()).toBe(`hub:${sha}`);
    expect(i18n.t("modal.cancel")).toBe("Lassa");

    // Leaving the hub drops its packs and the language they set.
    await applyHubLanguages(null, null, served(bytes), true);
    expect(languageOptions().some((o) => o.source === "hub")).toBe(false);
    expect(currentLanguageId()).not.toBe(`hub:${sha}`);

    storage[LANGUAGE_CHOICE_KEY] = "it";
    await setLanguage("it");
    await applyHubLanguages("https://hub.example", info, served(bytes), true);
    expect(currentLanguageId()).toBe("it");
  });

  it("leaves out a pack whose bytes do not match the listed hash", async () => {
    const info = { default: null, packs: [{ code: "sc", name: "Sardu", sha256: "00".repeat(32) }] };
    await applyHubLanguages("https://other.example", info, served(bytes), true);
    expect(languageOptions().some((o) => o.source === "hub")).toBe(false);
  });
});
