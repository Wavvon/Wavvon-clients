import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";

// D07 — a fresh desktop install pairs to a web identity from its first-run
// gate (issue #378). D02 pairs from Settings, which a desktop only reaches
// after creating a throwaway identity first; on a fresh install there is no
// account to write the pairing into, so this is the path that makes the
// paired subkey the device's first account.

test.describe("web → fresh desktop pairing", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a fresh desktop pairs from its first-run gate", async ({ page }) => {
    test.setTimeout(600_000);

    await page.goto("/");
    await expectInHub(page);

    await page.locator(".user-menu-trigger:visible").click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    // The Devices tab shows a collapsed row since the settings redesign.
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    const devices = page;
    await expect(page.getByText("Pair a new device")).toBeVisible({ timeout: 15_000 });
    const enable = devices.getByRole("button", { name: "Enable multi-device" });
    if (await enable.isVisible().catch(() => false)) await enable.click();
    await devices.getByRole("button", { name: "Start pairing" }).click();
    const codeBox = devices.getByLabel("Pairing code");
    let code = "";
    await expect(async () => {
      code = await codeBox.inputValue();
      expect(code.length).toBeGreaterThan(20);
    }).toPass({ timeout: 15_000 });
    const offer = JSON.parse(code) as { master_pubkey: string };

    const label = uniqueName("Fresh desktop");
    await desktop.page.getByRole("button", { name: "Pair with an existing device" }).click();
    await desktop.page.getByPlaceholder("Paste pairing code here…").fill(code);
    await desktop.page.getByPlaceholder("e.g. My Laptop").fill(label);
    await desktop.page.getByRole("button", { name: "Pair this device", exact: true }).click();

    await expect(devices.getByRole("button", { name: "Confirm pairing" })).toBeVisible({ timeout: 60_000 });
    await devices.getByRole("button", { name: "Confirm pairing" }).click();

    await expect(desktop.page.getByText("✅ This device is now paired.")).toBeVisible({ timeout: 60_000 });
    await desktop.page.getByRole("button", { name: "Done", exact: true }).click();

    // The gate is gone: the paired subkey is now this device's account.
    await expect(desktop.page.getByRole("button", { name: "Pair with an existing device" })).toHaveCount(0, {
      timeout: 15_000,
    });
    const accounts = await desktop.page.evaluate(() =>
      (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string) => Promise<{ kind: string; is_active: boolean }[]> } })
        .__TAURI_INTERNALS__.invoke("list_accounts"),
    );
    expect(accounts).toEqual([expect.objectContaining({ kind: "paired", is_active: true })]);
    await expect(async () => {
      const certs = await hubApi<{ device_label: string }[]>(page, `/identity/${offer.master_pubkey}/devices`);
      expect(certs.map((c) => c.device_label)).toContain(label);
    }).toPass({ timeout: 30_000 });
  });
});
