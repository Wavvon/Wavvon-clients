import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, uniqueName } from "./helpers/live";

// P32 — icon pickers (role/channel/category/soundboard) are unicode-only.
// Hub custom emoji are returned as `:name:` shortcodes that only resolve in
// messages; as an icon they'd render as literal text. So the icon pickers must
// exclude them, while the message composer still offers them.

const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

async function openRolesAdmin(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
}

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
  const roleName = uniqueName("Emo");
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByRole("textbox", { name: "Role name" }).fill(roleName);
  await page.getByRole("button", { name: "Create role" }).click();

  const row = page.locator(".settings-row").filter({ hasText: roleName }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole("button", { name: "Add reaction" }).click();
  // The picker is open, but with no hub-emoji section.
  await expect(page.getByText("Standard").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("This server")).toHaveCount(0);

  // Cleanup the role.
  await page.keyboard.press("Escape");
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toBeHidden({ timeout: 10000 });
});
