import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";
import { openHubAdminSection } from "../helpers/settings";

// P44 — hub settings are six areas across the top (#464). Section ids and
// labels are unchanged, so navigation still lands on the same pages.

async function openHubSettings(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
}

test("hub settings show their areas across the top", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openHubSettings(page);
  const areas = page.locator(".settings-areas");
  await expect(areas.getByRole("button", { name: "General", exact: true })).toBeVisible({ timeout: 10000 });
  for (const area of ["Joining", "People", "Moderation", "Content", "Connections"]) {
    await expect(areas.getByRole("button", { name: area, exact: true })).toBeVisible();
  }
});

test("sections still navigate inside their areas", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openHubSettings(page);
  await openHubAdminSection(page, "Roles");
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible({ timeout: 10000 });
  await openHubAdminSection(page, "Invites");
  await expect(page.getByRole("heading", { name: "Invites" })).toBeVisible();
});
