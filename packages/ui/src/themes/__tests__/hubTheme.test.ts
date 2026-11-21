import { describe, expect, it } from "vitest";
import { sha256Hex } from "../gallery";
import { hubThemeUrl, loadHubTheme } from "../hubTheme";
import { exportTheme, newTheme } from "../theme";

describe("hub theme", () => {
  it("fetches by the hash URL once, and refuses a body that does not match", async () => {
    const bytes = exportTheme(newTheme("Hub", "dark"));
    const sha = await sha256Hex(bytes);
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      return new Response(bytes as BodyInit);
    };
    const pkg = await loadHubTheme("https://hub.example/", sha, fetchFn);
    expect(pkg.manifest.name).toBe("Hub");
    await loadHubTheme("https://hub.example", sha, fetchFn);
    expect(urls).toEqual([hubThemeUrl("https://hub.example", sha)]);
    expect(urls[0]).toBe(`https://hub.example/hub/theme/${sha}`);

    await expect(loadHubTheme("https://other.example", "00".repeat(32), fetchFn)).rejects.toThrow(/hash/);
  });
});
