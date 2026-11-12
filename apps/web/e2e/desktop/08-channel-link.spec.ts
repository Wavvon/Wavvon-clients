import { test, expect } from "@playwright/test";
import { inviteLink } from "./helpers/hubLinks";
import { expectInHub, hubApi, HUB_URL, uniqueName } from "../live/helpers/live";
import { launchDesktopApp, type DesktopApp } from "./helpers/desktopApp";
import { createDesktopIdentity, joinHub } from "./helpers/onboardDesktop";

// D08 — a wavvon:// channel link for a hub the desktop has already joined
// opens that channel (issue #385). It used to open add-hub for the very hub
// the user was in. The link is delivered the way the deep-link plugin hands
// it over while the app runs: as the join-hub-requested event.

test.describe("wavvon:// channel link on desktop", () => {
  let desktop: DesktopApp;

  test.beforeAll(async () => {
    desktop = await launchDesktopApp();
  });

  test.afterAll(async () => {
    await desktop?.close();
  });

  test("a channel link for a joined hub opens the channel", async ({ page }) => {
    test.setTimeout(600_000);

    await page.goto("/");
    await expectInHub(page);

    // Two channels, so landing on the target is not the auto-selected first one.
    await hubApi(page, "/channels", { method: "POST", body: { name: uniqueName("first") } });
    const target = await hubApi<{ id: string }>(page, "/channels", {
      method: "POST",
      body: { name: uniqueName("target") },
    });
    const marker = uniqueName("linked-message");
    await hubApi(page, `/channels/${target.id}/messages`, { method: "POST", body: { content: marker } });

    const invite = await hubApi<{ code: string }>(page, "/invites", { method: "POST", body: {} });
    const desktopName = uniqueName("Desktop");
    await createDesktopIdentity(desktop.page, desktopName);
    await joinHub(desktop.page, desktopName, inviteLink(HUB_URL, invite.code));
    await expect(desktop.page.getByText(marker)).toHaveCount(0);

    const link = `wavvon://${HUB_URL.replace(/^https?:\/\//, "")}/channel/${target.id}`;
    await desktop.page.evaluate(
      (payload) =>
        (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } })
          .__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "join-hub-requested", payload }),
      link,
    );

    await expect(desktop.page.getByText(marker)).toBeVisible({ timeout: 30_000 });
    await expect(desktop.page.getByRole("dialog")).toHaveCount(0);
  });
});
