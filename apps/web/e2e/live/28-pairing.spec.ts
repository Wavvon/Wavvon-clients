import { test, expect } from "@playwright/test";
import { expectInHub, HUB_URL, OWNER_PUBKEY, hubApi } from "./helpers/live";

// P28 — multi-device pairing. The owner (existing device) enables multi-device,
// creates a pairing offer, and approves the new device's claim. A brand-new
// browser context (the new device) claims the offer, receives a master-signed
// cert, joins the hub with it, and the hub resolves it to the SAME canonical
// identity as the owner — proving the SubkeyCert port unifies devices.

test("pair a new device and resolve it to the owner's identity", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  // Owner: Settings → Account → Devices → enable multi-device (self-cert +
  // re-auth so the hub records the master on the owner's row).
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const devices = page
    .locator(".settings-section", { has: page.getByText("Devices", { exact: true }) })
    .first();
  await expect(devices).toBeVisible({ timeout: 10000 });
  await devices.getByRole("button", { name: "Enable multi-device" }).click();
  await expect(devices.getByText(/Master key:/)).toBeVisible({ timeout: 15000 });

  // Owner: start pairing and grab the code. Keep settings open so the
  // section keeps polling for the claim.
  await devices.getByRole("button", { name: "Start pairing" }).click();
  const codeBox = devices.getByLabel("Pairing code");
  await expect(codeBox).toBeVisible({ timeout: 10000 });
  await expect(async () => {
    expect((await codeBox.inputValue()).length).toBeGreaterThan(20);
  }).toPass({ timeout: 10000 });
  const code = await codeBox.inputValue();

  // New device: a fresh context with no identity.
  const context = await browser.newContext({
    baseURL: "http://localhost:1421",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const nd = await context.newPage();
    await nd.goto("/");
    await nd.getByRole("button", { name: "Pair with an existing device" }).click();
    await nd.getByLabel("Device name").fill("Second device");
    await nd.getByLabel("Pairing code").fill(code);
    await nd.getByRole("button", { name: "Pair this device" }).click();

    // Owner: the claim arrives → approve it.
    await expect(devices.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 20000 });
    await devices.getByRole("button", { name: "Approve" }).click();

    // New device: pairing completes → the app leaves setup and shows the
    // WelcomeScreen to join a hub. Join with the stored cert.
    await expect(nd.getByPlaceholder(/hub\.example\.com/)).toBeVisible({ timeout: 20000 });
    await nd.getByPlaceholder(/hub\.example\.com/).fill(HUB_URL);
    await nd.getByRole("button", { name: "Join hub" }).click();
    await expectInHub(nd);

    // The hub resolves the paired subkey to the owner's canonical identity:
    // the new device acts as the same user, not a separate one.
    const me = await hubApi<{ public_key: string }>(nd, "/me");
    expect(me.public_key).toBe(OWNER_PUBKEY);
  } finally {
    await context.close();
  }
});
