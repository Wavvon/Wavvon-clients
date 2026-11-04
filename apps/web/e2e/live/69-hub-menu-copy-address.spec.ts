import { test, expect } from "@playwright/test";
import { expectInHub, HUB_URL } from "./helpers/live";

// P69 — the hub menu's "Copy hub address" puts the address a person would
// paste into Add hub on the clipboard, path prefix included: a farm-hosted
// hub lives at `<farm>/hub/<slug>`, and the farm root would join nothing.
test("copy hub address puts the hub's URL on the clipboard", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Copy hub address" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\/+$/, "")).toBe(HUB_URL.replace(/\/+$/, ""));
});
