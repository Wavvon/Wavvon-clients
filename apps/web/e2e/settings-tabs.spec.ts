import { test, expect } from "@playwright/test";
import { openSettingsSection } from "./helpers/settings";
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
    if (url.includes("/apps") || url.includes("/voice") || url.includes("/dh-key") || url.includes("/unread")) {
      void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      void route.fallback();
    }
  });
}

test("user settings shows every area, and every section is reachable", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await page.locator(".user-menu-trigger:visible").click({ timeout: 10000 });

  await page.getByRole("menu").getByRole("menuitem", { name: "Profile", exact: true }).click();
  const areas = page.locator(".settings-areas");
  for (const name of ["Profile", "Audio and video", "App", "Account and security", "Blocked and ignored"]) {
    await expect(areas.getByRole("button", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Trusted issuers", "Voice", "Camera", "Appearance", "Notifications", "About & credits", "Manage accounts", "Devices", "Blocked and ignored"]) {
    await openSettingsSection(page, name);
    await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible();
  }
});

test("camera tab renders the device picker", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await page.locator(".user-menu-trigger:visible").click({ timeout: 10000 });

  await page.getByRole("menu").getByRole("menuitem", { name: "Profile", exact: true }).click();
  await openSettingsSection(page, "Camera");
  await expect(page.getByLabel("Camera device").first()).toBeVisible();
});
