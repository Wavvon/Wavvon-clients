import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P44 — the long hub-admin nav is organized into labeled groups (#21). Tab
// labels/ids are unchanged, so navigation still works.

async function openHubSettings(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
}

test("admin nav shows section-group headers", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openHubSettings(page);
  await expect(page.locator(".settings-nav-group", { hasText: "General" }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".settings-nav-group", { hasText: "Members & safety" }).first()).toBeVisible();
  await expect(page.locator(".settings-nav-group", { hasText: "Integrations & bots" }).first()).toBeVisible();
});

test("tabs still navigate after grouping", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openHubSettings(page);
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Invites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invites" })).toBeVisible();
});
