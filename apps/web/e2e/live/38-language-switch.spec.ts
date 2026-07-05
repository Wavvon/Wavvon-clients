import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P38 — language switcher (Settings → Appearance). Previously the app read a
// persisted language on boot but offered no way to change it.

test("switching language updates the UI and persists", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();

  await page.locator("#settings-language").first().selectOption("it");

  // The nav labels re-render in Italian.
  await expect(page.getByRole("button", { name: "Aspetto", exact: true }).first()).toBeVisible({ timeout: 5000 });

  // Persisted for next boot.
  const stored = await page.evaluate(() => localStorage.getItem("wavvon_language"));
  expect(stored).toBe("it");
});
