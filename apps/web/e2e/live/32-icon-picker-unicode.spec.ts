import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, uniqueName, openRolesAdmin, createRoleInEditor, deleteSelectedRole } from "./helpers/live";

// P32 — icon pickers (role/channel/category/soundboard) are unicode-only.
// Hub custom emoji are returned as `:name:` shortcodes that only resolve in
// messages; as an icon they'd render as literal text. So the icon pickers must
// exclude them, while the message composer still offers them.

const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

test("hub custom emoji appear in the composer but not in icon pickers", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  // Seed a hub custom emoji.
  const emojiName = "cust" + Date.now().toString(36);
  await hubApi(page, "/admin/emojis", {
    method: "POST",
    body: { name: emojiName, mime: "image/png", data_b64: PNG_1x1_B64 },
  });

  // Make sure a text channel is selected so the composer is present.
  let composerEmoji = page.getByRole("button", { name: "Emoji" }).first();
  if (!(await composerEmoji.isVisible().catch(() => false))) {
    const ch = uniqueName("emo");
    await createChannel(page, ch, "Text");
    await channelButton(page, ch).click();
    composerEmoji = page.getByRole("button", { name: "Emoji" }).first();
  }

  // Composer picker DOES offer hub emoji (the "This server" section).
  await composerEmoji.click();
  await expect(page.getByText("This server").first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");

  // A role icon picker (unicodeOnly) does NOT — no "This server" section.
  await openRolesAdmin(page);
  // A new role opens on Appearance, where the icon picker is.
  const editor = await createRoleInEditor(page, uniqueName("Emo"));
  await editor.getByRole("button", { name: "Add reaction" }).click();
  // The picker is open, but with no hub-emoji section.
  await expect(page.getByText("Standard").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("This server")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await deleteSelectedRole(page);
});
