import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { downloadListing, findInstalled, isUpdate, listingPassesContrast, sha256Hex, type ThemeListing } from "../gallery";
import { newTheme } from "../theme";

const listing = (over: Partial<ThemeListing> = {}): ThemeListing => ({
  id: "l1",
  author_pubkey: "ed25519:aa",
  name: "Sakura",
  metadata: { colors: { dark: { "--text": "#ffffff", "--text-muted": "#dddddd", "--bg": "#000000", "--surface": "#111111", "--bg-elevated": "#111111", "--accent": "#ff8fb1", "--accent-text": "#000000" } } },
  download_url: "https://x/y.wavvontheme",
  sha256: "",
  listed_at: 1,
  ...over,
});

const installedWith = (author: string, name: string, sha256?: string) => {
  const t = newTheme(name, "dark");
  t.manifest.author_pubkey = author;
  return { id: "i1", sha256, ...t };
};

describe("gallery", () => {
  it("checks the download against the listed hash", async () => {
    const bytes = strToU8("package");
    const good = listing({ sha256: await sha256Hex(bytes) });
    const fetchOk = async () => new Response(bytes as BodyInit);
    await expect(downloadListing(good, fetchOk)).resolves.toEqual(bytes);
    await expect(downloadListing(listing({ sha256: "00".repeat(32) }), fetchOk)).rejects.toThrow(/hash/);
  });

  it("offers an update for the same author and name with a different package", () => {
    const have = [installedWith("ed25519:aa", "Sakura", "old")];
    expect(findInstalled(listing(), have)).toBeDefined();
    expect(isUpdate(listing({ sha256: "new" }), have)).toBe(true);
    expect(isUpdate(listing({ sha256: "old" }), have)).toBe(false);
    expect(isUpdate(listing({ sha256: "new", author_pubkey: "ed25519:bb" }), have)).toBe(false);
    expect(isUpdate(listing({ sha256: "new", name: "Other" }), have)).toBe(false);
  });

  it("flags a listing whose text fails AA", () => {
    const base = () => "#000000";
    expect(listingPassesContrast(listing(), base)).toBe(true);
    const bad = listing({ metadata: { colors: { dark: { "--text": "#777777", "--bg": "#808080", "--surface": "#808080", "--bg-elevated": "#808080" } } } });
    expect(listingPassesContrast(bad, () => "#808080")).toBe(false);
  });
});
