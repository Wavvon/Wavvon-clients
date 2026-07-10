import { test, expect } from "@playwright/test";
import { injectSession, mockJson, HUB_URL } from "./helpers/mockApi";

// Background effects actually engage: with a fake camera, selecting Blur and
// previewing must load the MediaPipe segmentation (self-hosted WASM + model)
// and report the effect as active — not silently fall back to raw video.
// Mock-API — no real hub needed.

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

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

test("blur background engages segmentation and reports active", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await page.locator(".btn-icon-gear").first().click({ timeout: 10000 });
  await page.locator(".settings-nav").getByRole("button", { name: "Camera", exact: true }).click();

  await page.getByLabel("Background effect").selectOption("blur");
  await page.getByRole("button", { name: "Preview camera" }).click();

  // WASM + model load takes a moment on first run; "active" only renders if
  // SelfieSegmentation constructed AND initialize() resolved.
  await expect(page.getByText("Background effect active")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".settings-content video")).toBeVisible();

  // Screenshot for human inspection of the actual composited output.
  await page.waitForTimeout(1500);
  await page.locator(".settings-content video").screenshot({ path: "test-results/camera-blur-preview.png" });
});
