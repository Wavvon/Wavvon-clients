import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { channelButton, expectInHub, hubApi, HUB_URL, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D01 — a DM exchanged between the web client and the real desktop app.
//
// The DM envelope is pinned by cross-language vectors: `packages/core` in
// TypeScript and `src-tauri/src/identity.rs` in Rust assert the same bytes. A
// vector says the two agree on a message they both already hold; it cannot say
// that a message one of them *sent* is one the other can read, because that
// path runs through the ratchet, the hub outbox and each client's own key
// handling. Web↔web is covered (live P57). This is the pair that was not.
//
// **This spec fails today, and that is what it is for.** Web→desktop passes:
// the desktop app receives and decrypts a DM the web client encrypted. The
// return leg does not — the desktop composer accepts the text, Enter posts
// nothing to the hub (verified twice against `dm_messages`), no encryption
// warning appears and nothing surfaces in the UI. Silent, which is why no
// suite had caught it. See the wiki's next-up.md, Known issues.

test.describe("web ↔ desktop", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a DM crosses between the web client and the desktop app", async ({ page }) => {
    test.setTimeout(600_000);

    await page.goto("/");
    await expectInHub(page);

    // A hub with no channels shows the owner the template picker, whose
    // overlay swallows every click behind it.
    const channel = uniqueName("dmdesk");
    await hubApi(page, "/channels", { method: "POST", body: { name: channel } });

    // The desktop side joins with an invite link: a fresh hub is invite_only,
    // and desktop's AddHubModal takes the code in the address rather than in a
    // field of its own.
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });
    const before = new Set(
      (await hubApi<{ public_key: string }[]>(page, "/users")).map((u) => u.public_key),
    );
    const desktopName = uniqueName("Desktop");
    await createDesktopIdentity(desktop.page, desktopName);
    await joinHub(desktop.page, desktopName, inviteLink(HUB_URL, invite.code));

    // Which member the desktop app became, by difference — the roster is the
    // hub's answer to "who did that app authenticate as", and a desktop
    // identity is seated under the master its self-signed cert names rather
    // than the device key the app shows anywhere.
    await expect(async () => {
      const now = await hubApi<{ public_key: string }[]>(page, "/users");
      const fresh = now.find((u) => !before.has(u.public_key));
      expect(fresh, "the desktop app never appeared in the roster").toBeTruthy();
    }).toPass({ timeout: 60_000 });

    // Owner reloads to pick up the new member, and opens a channel: the
    // member list lives in the channel view.
    await page.reload();
    await expectInHub(page);
    await channelButton(page, channel).click();

    // Web opens the DM from the member list. By name: desktop asks for a
    // display name on its first hub now, so the roster no longer shows a
    // pubkey slice.
    const memberRow = page.locator("li.user-list-item", { hasText: desktopName });
    await expect(memberRow).toBeVisible({ timeout: 30_000 });
    await memberRow.click({ button: "right" });
    await page.locator(".context-menu").getByText("Direct message").click();

    const composer = page.getByPlaceholder("Write a message");
    await expect(composer).toBeVisible({ timeout: 15_000 });
    const fromWeb = `web→desktop ${Date.now()}`;
    await composer.fill(fromWeb);
    await composer.press("Enter");
    await expect(page.getByText(fromWeb).first()).toBeVisible({ timeout: 15_000 });

    // Desktop reads it. This is the assertion the vectors cannot make: the
    // Rust side decrypting what the TypeScript side encrypted, live.
    const webName = (await hubApi<{ display_name: string | null }>(page, "/me")).display_name ?? "";
    expect(webName).not.toBe("");
    await desktop.page.getByTitle("Direct Messages").first().click();
    const convRow = desktop.page.locator("li.channel-item", { hasText: webName });
    await expect(convRow).toBeVisible({ timeout: 60_000 });
    await convRow.click();
    await expect(desktop.page.getByText(fromWeb).first()).toBeVisible({ timeout: 60_000 });

    // And back the other way — the direction that exercises the Rust encrypt
    // and the TypeScript decrypt.
    const fromDesktop = `desktop→web ${Date.now()}`;
    const desktopComposer = desktop.page.getByPlaceholder("Write a message");
    await expect(desktopComposer).toBeVisible({ timeout: 15_000 });
    await desktopComposer.fill(fromDesktop);
    await desktopComposer.press("Enter");

    // A desktop send that cannot encrypt puts up the DM encryption warning and
    // posts nothing. Surfacing its text turns "the reply never arrived" into
    // the reason it never arrived.
    const warning = desktop.page.locator(".encryption-warning-modal");
    if (await warning.isVisible().catch(() => false)) {
      throw new Error(`desktop refused to send: ${await warning.innerText()}`);
    }
    // A send that reached the hub and was rejected surfaces as the app's own
    // error toast and nowhere else — five seconds, then gone. Reading it here
    // is the difference between "the reply never arrived" and the hub's own
    // reason for refusing it.
    const toast = desktop.page.locator(".toast");
    await toast.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if (await toast.isVisible().catch(() => false)) {
      throw new Error(`desktop reported: ${await toast.innerText()}`);
    }
    await expect(page.getByText(fromDesktop).first()).toBeVisible({ timeout: 60_000 });
  });
});
