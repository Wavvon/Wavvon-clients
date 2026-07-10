import { test, expect } from "@playwright/test";
import { injectSession, mockJson, HUB_URL } from "./helpers/mockApi";

// Settings nav regression: every user-settings tab must be reachable and the
// Camera tab must render its section. Mock-API — no real hub needed.

const ME_INFO = {
  public_key: "my-pubkey",
  display_name: "Tester",
  avatar: null,
  approval_status: "approved",
  roles: [],
};

async function setupBaseRoutes(page: import("@playwright/test").Page) {
  await injectSession(page);
  await mockJson(page, `${HUB_URL}/channels`, []);
  await mockJson(page, `${HUB_URL}/users`, []);
  await mockJson(page, `${HUB_URL}/me`, ME_INFO);
  await mockJson(page, `${HUB_URL}/conversations`, []);
  await mockJson(page, `${HUB_URL}/alliances`, []);
  await page.route(`${HUB_URL}/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/bots") || url.includes("/voice") || url.includes("/dh-key") || url.includes("/unread")) {
      void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      void route.fallback();
    }
  });
}

test("user settings shows every tab in the nav", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await page.locator(".btn-icon-gear").first().click({ timeout: 10000 });
  const nav = page.locator(".settings-nav");
  for (const name of ["Profile", "Notifications", "Appearance", "Voice", "Camera", "Account"]) {
    await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("camera tab renders the device picker", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await page.locator(".btn-icon-gear").first().click({ timeout: 10000 });
  await page.locator(".settings-nav").getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByLabel("Camera device").first()).toBeVisible();
});
