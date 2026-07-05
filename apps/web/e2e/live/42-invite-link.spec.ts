import { test, expect } from "@playwright/test";
import { expectInHub, hubApi } from "./helpers/live";

// P42 — invite links are farm-ready: wavvon://<host>/i/<hubSerial>/<code>,
// where the serial is the hub's public key, so a farm can route the same
// domain to different hubs by serial (not just host:port).

async function openInvites(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Invites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invites" })).toBeVisible({ timeout: 10000 });
}

test("a created invite shows a farm-ready link with hub serial + code", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openInvites(page);

  await page.getByRole("button", { name: "Create", exact: true }).first().click();

  const link = page.locator("code.pubkey-display", { hasText: "wavvon://" }).first();
  await expect(link).toBeVisible({ timeout: 10000 });
  const text = (await link.textContent()) ?? "";
  // wavvon://localhost:3000/i/<64-hex-serial>/<code>
  expect(text).toMatch(/^wavvon:\/\/localhost:3000\/i\/[0-9a-f]{64}\/.+/);
});

test("the invite link's serial is the hub's own public key", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const info = await hubApi<{ public_key: string }>(page, "/info");

  await openInvites(page);
  await page.getByRole("button", { name: "Create", exact: true }).first().click();
  const link = page.locator("code.pubkey-display", { hasText: "wavvon://" }).first();
  await expect(link).toBeVisible({ timeout: 10000 });
  const text = (await link.textContent()) ?? "";
  expect(text).toContain(`/i/${info.public_key}/`);
});
