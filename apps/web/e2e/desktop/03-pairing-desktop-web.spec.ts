import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { expectInHub, hubApi, HUB_URL, APP_URL, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D03 — the same pairing protocol from the other end: the desktop app issues
// the code and a browser claims it. D02 covers web offering; this one is what
// says the two clients agree on the payload in *both* directions rather than
// happening to meet in one.
//
// The desktop app is the only side that can be the existing device here — it
// holds the entropy and signs the offer — so the browser arrives with no
// identity at all, which is also the real shape of "I installed the web client
// on a second machine".

test.describe("desktop → web pairing", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a browser pairs to the desktop app's identity", async ({ page, browser }) => {
    test.setTimeout(600_000);

    // The owner context exists only to mint an invite — the pairing itself is
    // between the desktop app and a fresh browser.
    await page.goto("/");
    await expectInHub(page);
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });

    const desktopName = uniqueName("Desktop");
    await createDesktopIdentity(desktop.page, desktopName);
    await joinHub(desktop.page, desktopName, inviteLink(HUB_URL, invite.code));

    // Desktop: Settings → Devices → pair a new device, against the hub it just
    // joined, and read the code it shows.
    await desktop.page.locator(".btn-icon-gear").first().click();
    await desktop.page.getByRole("button", { name: "Devices", exact: true }).click();
    await desktop.page.getByRole("button", { name: "Pair a new device…" }).click();
    // The hub list re-renders as the app settles, and a click that lands mid
    // re-render is swallowed by the controlled input — so click until it takes.
    const hubBox = desktop.page.locator(".pairing-hub-list input[type=checkbox]").first();
    await expect(async () => {
      await hubBox.click();
      await expect(hubBox).toBeChecked({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await desktop.page.getByRole("button", { name: "Generate pairing code" }).click();
    const codeArea = desktop.page.locator("textarea.pairing-code-area");
    await expect(codeArea).toBeVisible({ timeout: 30_000 });
    const code = await codeArea.inputValue();
    const offer = JSON.parse(code) as { master_pubkey: string; signature: string };
    expect(offer.signature).toMatch(/^[0-9a-f]{128}$/);

    // A fresh browser claims it — no identity, no storage state.
    const context = await browser.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const nd = await context.newPage();
      await nd.goto("/");
      await nd.getByRole("button", { name: "Pair with an existing device" }).click();
      await nd.getByLabel("Device name").fill("Paired browser");
      await nd.getByLabel("Pairing code").fill(code);
      await nd.getByRole("button", { name: "Pair this device" }).click();

      // Desktop: the claim arrives with a fingerprint to confirm.
      const confirm = desktop.page.getByRole("button", { name: "Confirm pairing" });
      await expect(confirm).toBeVisible({ timeout: 60_000 });
      await confirm.click();
      await expect(desktop.page.getByText("✅ Device paired successfully.")).toBeVisible({
        timeout: 60_000,
      });

      // The hub's device registry is the neutral witness: the browser's subkey
      // now hangs off the desktop identity's master.
      await expect(async () => {
        const certs = await hubApi<{ device_label: string }[]>(
          page,
          `/identity/${offer.master_pubkey}/devices`,
        );
        expect(certs.map((c) => c.device_label)).toContain("Paired browser");
      }).toPass({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  });
});
