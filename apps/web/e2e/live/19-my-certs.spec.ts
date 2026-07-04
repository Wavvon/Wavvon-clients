import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P19 — a member's own certifications viewer (Settings → Account). Read-only
// fan-out over GET /identity/{pubkey}/certs. The e2e owner has no certs, so
// this is a smoke test that the section renders and reports the empty state.

test("my certifications section renders", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Account", exact: true }).click();

  await expect(page.getByText("My certifications")).toBeVisible();
  await expect(page.getByText("No certifications yet.")).toBeVisible({ timeout: 10000 });
});
