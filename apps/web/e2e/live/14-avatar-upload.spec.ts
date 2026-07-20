import { test, expect } from "@playwright/test";
import { expectInHub, hubApi } from "./helpers/live";

// P14 — avatar image upload (parity with desktop's ImagePicker). Picking a
// file center-crops it to a 128px JPEG data URL and saves it to /me.

// A tiny valid 1x1 PNG.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

test("upload an avatar image; it saves as a data URL", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  // The default profile context is local-only (P24) — editing the hub's own
  // context is what actually PATCHes /me. Index 0 is the default profile;
  // index 1 is the (only) joined hub.
  await page.locator("#profile-context-select").selectOption({ index: 1 });

  // The profile card's avatar opens a chooser (upload tab is the default);
  // picking a file there closes the chooser and updates the card avatar live.
  await page.getByRole("button", { name: "Change avatar" }).click();
  await page.locator('.image-picker input[type="file"]').first().setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });

  // The card's avatar renders the cropped data URL (JPEG).
  const preview = page.locator(".profile-card-avatar-wrap img.avatar-img");
  await expect(preview).toBeVisible({ timeout: 10000 });
  await expect(preview).toHaveAttribute("src", /^data:image\/jpeg/);

  // Save → hub stores a data-URL avatar.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: false }).first()).toBeVisible({ timeout: 5000 });
  const me = await hubApi<{ avatar: string | null }>(page, "/me");
  expect(me.avatar ?? "").toMatch(/^data:image\/jpeg/);
});
