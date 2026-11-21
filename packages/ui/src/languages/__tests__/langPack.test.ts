import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import i18n, { initI18n, currentLanguageId, languageOptions, resolveLanguage, setLanguage } from "@wavvon/i18n";
import { isLockedKey, sanitizePackStrings } from "@wavvon/i18n";
import { PackageError } from "../../themes/packageFormat";
import { createMemoryPackageStore } from "../../themes/packageStore";
import { exportLangPack, installLangPack, loadLangPack, removeLangPack, type LangManifest } from "../langPack";

function pack(manifest: Record<string, unknown>, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { "lang.json": strToU8(JSON.stringify(manifest)) };
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}

const base = { format: "wavvon.lang", version: 1, code: "sc", name: "Sardu", strings: {} };

describe("language pack envelope", () => {
  it("loads a valid pack and canonicalizes its code", () => {
    const { manifest } = loadLangPack(pack({ ...base, code: "it-ch", strings: { "modal.cancel": "Annulla" } }));
    expect(manifest.code).toBe("it-CH");
    expect(manifest.strings["modal.cancel"]).toBe("Annulla");
    expect(loadLangPack(exportLangPack({ manifest, files: {} })).manifest).toEqual(manifest);
  });

  it("rejects a bad code, non-string values, extra files and oversize", () => {
    expect(() => loadLangPack(pack({ ...base, code: "not a tag!" }))).toThrow(PackageError);
    expect(() => loadLangPack(pack({ ...base, strings: { "modal.cancel": 3 } }))).toThrow(/expected text/);
    expect(() => loadLangPack(pack({ ...base, strings: { "modal.cancel": { nested: "x" } } }))).toThrow(PackageError);
    expect(() => loadLangPack(pack(base, { "img.png": "x" }))).toThrow(/not allowed/);
    const big = { ...base, strings: { "modal.cancel": "x".repeat(600 * 1024) } };
    expect(() => loadLangPack(pack(big))).toThrow(/larger than 512 KB/);
  });
});

describe("what a pack may change", () => {
  it("drops locked keys, unknown keys, bad ICU and changed placeholders", () => {
    expect(isLockedKey("identity_setup.recover.phrase_label")).toBe(true);
    const out = sanitizePackStrings(
      {
        "modal.cancel": "Annulla",
        "identity_setup.recover.phrase_label": "Phishing here",
        "no.such.key": "x",
        "hubs.mention_ago": "{broken",
        "dm.add_people.title": "{other}",
      },
      "sc",
    );
    expect(out).toEqual({ "modal.cancel": "Annulla" });
  });

  it("lays a pack over its language, with English and the official catalogue underneath", async () => {
    await initI18n("en");
    const store = createMemoryPackageStore<LangManifest>();
    const strings = { "modal.cancel": "Lassa", "identity_setup.recover.phrase_label": "Phishing here" };
    const registered = await installLangPack(pack({ ...base, strings }), store);
    expect(registered.coverage).toBeGreaterThan(0);
    expect(languageOptions().some((o) => o.id === registered.id)).toBe(true);
    expect(resolveLanguage(registered.id, "en")).toBe(registered.id);

    await setLanguage(registered.id);
    expect(currentLanguageId()).toBe(registered.id);
    expect(i18n.t("modal.cancel")).toBe("Lassa");
    expect(i18n.t("identity_setup.recover.phrase_label")).toBe(i18n.getFixedT("en")("identity_setup.recover.phrase_label"));

    // A pack for a shipped language overrides only its own keys, and the
    // official catalogue comes back once it is left.
    const it = await installLangPack(pack({ ...base, code: "it", name: "Italiano (mio)", strings: { "modal.cancel": "Lascia" } }), store);
    await setLanguage(it.id);
    expect(i18n.t("modal.cancel")).toBe("Lascia");
    expect(i18n.t("modal.save")).toBe("Salva");
    await setLanguage("it");
    expect(i18n.t("modal.cancel")).toBe("Annulla");

    await removeLangPack(registered.id, store);
    expect(languageOptions().some((o) => o.id === registered.id)).toBe(false);
    await setLanguage("en");
  });
});
