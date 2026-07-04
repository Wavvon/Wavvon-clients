import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "./helpers/live";

// P24 — multi-profile (client-only presets). Create a profile, apply it to
// the hub (updates /me), verify, then delete.

test("create, apply, and delete a saved profile", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Saved profiles", { exact: true })).toBeVisible();

  const label = uniqueName("Gaming");
  const dispName = uniqueName("xX_Player");
  await page.getByRole("textbox", { name: "New profile label" }).fill(label);
  await page.getByRole("textbox", { name: "New profile display name" }).fill(dispName);
  await page.getByRole("button", { name: "Create profile" }).click();

  // The profile appears; apply it to the active hub.
  const row = page.locator(".settings-section", { hasText: label });
  await expect(row.first()).toBeVisible({ timeout: 10000 });
  await row.first().getByRole("button", { name: "Apply to hub" }).click();

  // /me now reflects the profile's display name.
  await expect.poll(async () => (await hubApi<{ display_name: string | null }>(page, "/me")).display_name)
    .toBe(dispName);

  // Delete it.
  await row.first().getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".settings-section", { hasText: label })).toHaveCount(0);
});
