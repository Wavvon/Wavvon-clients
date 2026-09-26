import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { expectInHub, hubApi, HUB_URL, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D02 — pairing a desktop device to a web identity.
//
// This could not be written until 2026-09-06: the two clients emitted
// different pairing codes — web a short `base64({hub, token})`, desktop the
// signed `PairingOffer` JSON its `parse_pairing_offer` wants — so neither
// could read the other's, in either direction, and nothing said so. The paste
// was simply rejected as invalid. decisions.md, "The pairing code is the
// signed offer itself, not a pointer to it", settled which shape wins; this is
// the spec that says the two clients actually speak it.
//
// What only a two-client run can prove: that the string one client *renders*
// is the string the other client *parses*, signature and all.

test.describe("web → desktop pairing", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a desktop device pairs to the web client's identity", async ({ page }) => {
    test.setTimeout(600_000);

    await page.goto("/");
    await expectInHub(page);

    // The desktop side needs an identity and a hub of its own before it can
    // reach Settings at all; pairing then replaces that identity with the
    // web client's.
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });
    const desktopName = uniqueName("Desktop");
    await createDesktopIdentity(desktop.page, desktopName);
    await joinHub(desktop.page, desktopName, inviteLink(HUB_URL, invite.code));

    // Web: Settings → Devices → Start pairing, and read the code it shows.
    await page.locator(".btn-icon-gear").click();
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    const devices = page.locator(".settings-section", { has: page.getByText("Devices") }).first();
    await expect(devices).toBeVisible({ timeout: 15_000 });
    const enable = devices.getByRole("button", { name: "Enable multi-device" });
    if (await enable.isVisible().catch(() => false)) await enable.click();
    await devices.getByRole("button", { name: "Start pairing" }).click();
    const codeBox = devices.getByLabel("Pairing code");
    await expect(codeBox).toBeVisible({ timeout: 15_000 });
    let code = "";
    await expect(async () => {
      code = await codeBox.inputValue();
      expect(code.length).toBeGreaterThan(20);
    }).toPass({ timeout: 15_000 });

    // It is the signed offer, not a pointer to one — the property the desktop
    // side depends on, asserted here so a regression names itself rather than
    // failing as "the paste was rejected".
    const offer = JSON.parse(code) as { master_pubkey: string; home_hubs: string[]; signature: string };
    expect(offer.master_pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(offer.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(offer.home_hubs.length).toBeGreaterThan(0);

    // Desktop: Settings → the pairing section → paste it.
    await desktop.page.locator(".btn-icon-gear").first().click();
    await desktop.page.getByRole("button", { name: "Devices", exact: true }).click();
    await desktop.page.getByRole("button", { name: "Pair this device with another…" }).click();
    await desktop.page.getByPlaceholder("Paste pairing code here…").fill(code);
    await desktop.page.getByPlaceholder("e.g. My Laptop").fill("Paired desktop");
    await desktop.page.getByRole("button", { name: "Pair this device", exact: true }).click();

    // Web: the claim arrives, and approving it issues the cert.
    await expect(devices.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 60_000 });
    await devices.getByRole("button", { name: "Approve" }).click();

    // Desktop: paired, and paired to *this* identity — the hub attributes it
    // to the web client's canonical pubkey rather than seating it as a second
    // member.
    await expect(desktop.page.getByText("✅ This device is now paired.")).toBeVisible({
      timeout: 60_000,
    });
    await expect(async () => {
      const certs = await hubApi<{ device_label: string }[]>(
        page,
        `/identity/${offer.master_pubkey}/devices`,
      );
      expect(certs.map((c) => c.device_label)).toContain("Paired desktop");
    }).toPass({ timeout: 30_000 });
  });
});
