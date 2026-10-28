import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { channelButton, createChannel, expectInHub, hubApi, HUB_URL, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D06 — a screen shared from desktop decodes on a web viewer.
//
// Desktop's share hooks asked the shell for the hub socket without naming the
// hub, so the call was refused and the share never started; and the shell
// would not have handed back a token anyway (Wavvon-clients#193). Web viewers
// only read chunks, so the assertion is the same decoded frame P64 asks of a
// web sharer.

test.describe("desktop screen share", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp({
      browserArgs: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--mute-audio",
        '--auto-select-desktop-capture-source="Entire screen"',
      ],
    });
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a web viewer decodes frames shared from desktop", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto("/");
    await expectInHub(page);
    const channel = uniqueName("dshare");
    await createChannel(page, channel, "Voice channel");
    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });

    const d = desktop.page;
    const name = uniqueName("Desktop");
    await createDesktopIdentity(d, name);
    await joinHub(d, name, inviteLink(HUB_URL, invite.code));

    await channelButton(page, channel).dblclick();
    await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 30_000 });

    await channelButton(d, channel).dblclick({ timeout: 60_000 });
    await expect(d.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 60_000 });
    // Desktop plays voice through its own audio stack, which no browser switch
    // mutes, and the web side is sending the fake microphone's beep.
    await d.getByRole("button", { name: "Mute all audio" }).click();

    await d.getByTitle("Share screen").click();
    await d.getByRole("button", { name: "Share", exact: true }).click({ timeout: 30_000 });

    await expect(page.locator(".screen-share-panel")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream")?.videoWidth ?? 0,
          ),
        { timeout: 60_000, message: "the web viewer must decode a frame shared from desktop" },
      )
      .toBeGreaterThan(0);
  });
});
