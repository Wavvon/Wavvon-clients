import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MicOffIcon, MicOnIcon } from "../../components/Icons";
import { setThemeIcons } from "../themeIcons";

afterEach(() => setThemeIcons({}));

describe("themed icons", () => {
  it("renders the built-in glyph without an override", () => {
    expect(renderToString(<MicOnIcon />)).toContain("<svg");
  });

  it("renders an override as an image, never inline", () => {
    setThemeIcons({ mic: "blob:x" });
    const html = renderToString(<MicOnIcon size={20} />);
    expect(html).toContain("<img");
    expect(html).not.toContain("<svg");
  });

  it("keeps the off treatment around a replaced off glyph", () => {
    setThemeIcons({ "mic-off": "blob:y" });
    expect(renderToString(<MicOffIcon />)).toContain("themed-icon-off");
  });
});
