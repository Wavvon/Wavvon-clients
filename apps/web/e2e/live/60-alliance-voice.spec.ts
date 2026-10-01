import { test, expect } from "@playwright/test";
import { expectInHub, confirmInApp } from "./helpers/live";

// P60 — voice in a channel the *allied* hub hosts.
//
// This is the one alliance path where the client talks to a hub it never
// joined: its own hub signs a grant, the other hub redeems it, and the client
// then dials that hub's WebTransport relay direct — a datagram carries no path
// to route on, so nothing proxies it (alliances.md, voice-transport-v2.md).
//
// It is also the only voice assertion in this suite that cannot pass on a
// broken transport. Every other one reads roster state the hub pushes over the
// WebSocket; here the voice status label is set from `onReady`, which fires
// after `transport.ready` resolves, so a label naming the channel *is* an
// opened session against the other hub's relay.
//
// Set up by e2e-topology's `alliancebrowser` stage — two hubs, an alliance,
// and a shared channel. Skips without it.

const CHANNEL = process.env.WAVVON_E2E_ALLIANCE_CHANNEL;

test("voice joins the allied hub's relay from a hub that only has the grant", async ({ page }) => {
  test.skip(
    !CHANNEL,
    "no alliance set up — run e2e-topology's alliancebrowser stage, which sets WAVVON_E2E_ALLIANCE_*",
  );
  test.setTimeout(90000);

  await page.goto("/");
  await expectInHub(page);

  const channel = page
    .locator(".sidebar-alliance-group")
    .locator(".channel-item", { hasText: CHANNEL! });
  await expect(channel).toBeVisible({ timeout: 20000 });

  // The 🔊 on the row is the alliance-voice affordance; it stops propagation
  // so the row is not selected by it.
  await channel.getByRole("button", { name: /Join voice on/ }).click();

  // Joining asks first, because the visitor dials the owning hub direct and
  // that hub's operator sees the IP — so the address is named before anything
  // is minted. The app draws the dialog, so nothing native fires: read it off
  // the modal before accepting it.
  const modal = page.locator(".confirm-modal");
  await modal.waitFor({ state: "visible", timeout: 20000 });
  const asked = await modal.innerText();
  await confirmInApp(page);

  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`, {
    timeout: 30000,
  });

  // The prompt has to name the hub being dialed; that is its whole purpose.
  expect(asked).toContain(CHANNEL!);
  expect(asked).toMatch(/https?:\/\//);
});
