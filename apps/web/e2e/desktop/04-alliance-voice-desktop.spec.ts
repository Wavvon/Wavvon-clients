import { test, expect, type Page } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { channelButton, confirmInApp, expectInHub, hubApi, HUB_URL, newMemberPage, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D04 — the desktop app hears an allied hub's voice room.
//
// Alliance voice audio was proved by two *web* clients (live P63). Desktop's
// half is a different implementation entirely — the Rust shell opens its own
// visitor socket to the owning hub and runs the voice pipeline against it —
// and a room whose roster is right can still be silent, which is exactly how
// alliance voice shipped the first time. So the assertion is the desktop's
// inbound packet-loss readout, which stays "—" until a datagram has been
// unsealed with a key that arrived over the visitor socket and decoded.
//
// Set up by e2e-topology's `alliancebrowser` stage, like P63: the live hub is
// the alliance member, and an invite to the *host* hub puts a web client on
// the far side. Skips without it.

const CHANNEL = process.env.WAVVON_E2E_ALLIANCE_CHANNEL;
const HOST_URL = process.env.WAVVON_E2E_ALLIANCE_HOST_URL;
const HOST_INVITE = process.env.WAVVON_E2E_ALLIANCE_HOST_INVITE;

// Music turns the silence gate off, so the host's fake capture device
// transmits continuously (see P62).
const MUSIC_PROFILE = JSON.stringify({
  profile: "music",
  customBitrate: null,
  customApp: "voip",
  customNoiseSuppress: true,
  customVad: false,
  vadThreshold: 0.02,
  customVadThreshold: 0.02,
  customChannels: 1,
  customFrameMs: 20,
  customComplexity: 9,
});

function connValue(page: Page, key: string) {
  return page.locator(".conn-panel .conn-row").filter({ hasText: key }).locator(".conn-val");
}

test.describe("desktop in an alliance voice room", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    test.skip(
      !CHANNEL || !HOST_URL || !HOST_INVITE,
      "no alliance set up — run e2e-topology's alliancebrowser stage, which sets WAVVON_E2E_ALLIANCE_*",
    );
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("the desktop visitor hears the allied hub's room", async ({ page, browser }) => {
    test.setTimeout(600_000);

    await page.goto("/");
    await expectInHub(page);
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });
    const desktopName = uniqueName("Desktop");
    await createDesktopIdentity(desktop.page, desktopName);
    await joinHub(desktop.page, desktopName, inviteLink(HUB_URL, invite.code));

    const { context, page: host } = await newMemberPage(browser, uniqueName("Host"), {
      url: HOST_URL!,
      inviteCode: HOST_INVITE!,
    });
    try {
      await host.evaluate((cfg) => localStorage.setItem("wavvon.audio_profile", cfg), MUSIC_PROFILE);
      await channelButton(host, CHANNEL!).dblclick();
      await expect(host.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`, {
        timeout: 30_000,
      });

      const d = desktop.page;
      const channel = d.locator(".sidebar-alliance-group").locator(".channel-item", { hasText: CHANNEL! });
      await expect(channel).toBeVisible({ timeout: 60_000 });
      // Left edge: a centre click lands on the 🔊 inside the row (see P63).
      await channel.click({ position: { x: 4, y: 4 } });
      await channel.getByRole("button", { name: /Join voice on/ }).click();
      await confirmInApp(d);
      await expect(d.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`, {
        timeout: 60_000,
      });

      // The host does the talking, in the foreground: a backgrounded tab's
      // capture is throttled.
      await host.bringToFront();

      await d.locator(".conn-chip").click({ timeout: 15_000 });
      await expect(d.locator(".conn-panel")).toBeVisible();
      await expect(connValue(d, "Packet loss (in)")).toHaveText(/^\d+(\.\d+)? %$/, {
        timeout: 90_000,
      });
    } finally {
      await context.close();
    }
  });
});
