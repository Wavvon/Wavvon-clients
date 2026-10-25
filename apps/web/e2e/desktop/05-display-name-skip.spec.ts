import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { expectInHub, hubApi, HUB_URL } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity } from "./helpers/onboardDesktop";

// D05 — "Skip for now" on the display-name prompt is an answer. It was not
// remembered, so the prompt came back on every launch (Wavvon-clients#136).

test.describe("desktop display-name prompt", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("skipping it once is remembered across a reload", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto("/");
    await expectInHub(page);
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });

    const d = desktop.page;
    await createDesktopIdentity(d);
    await d.getByRole("button", { name: "Add hub" }).click({ timeout: 60_000 });
    await d.getByPlaceholder(/hub\.example\.com/).fill(inviteLink(HUB_URL, invite.code));
    await d.locator(".modal-actions").getByRole("button", { name: /^(Join hub|Connect)$/ }).click();

    const prompt = d.getByRole("heading", { name: "What should we call you?" });
    await expect(prompt).toBeVisible({ timeout: 60_000 });
    await d.getByRole("button", { name: "Skip for now" }).click();
    await expect(prompt).toBeHidden();

    await d.reload();
    await expect(d.locator(".hub-header-button")).toBeVisible({ timeout: 60_000 });
    // Long enough for the roster to load and the prompt's effect to run.
    await d.waitForTimeout(5_000);
    await expect(prompt).toBeHidden();
  });
});
