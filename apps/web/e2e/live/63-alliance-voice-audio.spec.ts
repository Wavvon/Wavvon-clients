import { test, expect, type Page } from "@playwright/test";
import { channelButton, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P63 — audio crosses a hub boundary.
//
// P60 proves the visitor's WebTransport session to the *allied* hub's relay
// comes up. That is admission, and admission is where every alliance-voice
// assertion stopped: a room whose transport is open and whose roster is right
// can still be completely silent, and was.
//
// A visitor is a stranger on the owning hub, and E2E voice keys are wrapped
// static-static X25519 — so both sides have to find each other's DH keys *on
// the hub the room is on*. Both halves were missing: the visitor looked its
// peers up on its own hub (404, which the key manager reads as "skip this
// peer"), and it never published its own key on theirs, so nobody could wrap
// for it either. The hub's visitor allowlist has carried both DH routes from
// the start (auth/middleware.rs, `ALLIANCE_VOICE_ALLOWED_PATHS`, whose comment
// says why) and no client had ever used them.
//
// The assertion is the visitor's inbound packet-loss readout, which reads "—"
// until a datagram has been parsed, unsealed with a key that arrived over the
// WebSocket, and Opus-decoded. P62 makes the same claim within one hub.
//
// Set up by e2e-topology's `alliancebrowser` stage: two hubs, an alliance, a
// shared channel, and an invite to the *host* hub so this spec can put a
// second real client on the far side. Skips without it.

const CHANNEL = process.env.WAVVON_E2E_ALLIANCE_CHANNEL;
const HOST_URL = process.env.WAVVON_E2E_ALLIANCE_HOST_URL;
const HOST_INVITE = process.env.WAVVON_E2E_ALLIANCE_HOST_INVITE;

// Music turns the silence gate off, so the fake capture device transmits
// continuously instead of having to trip a threshold (see P62).
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

async function transmitContinuously(page: Page) {
  await page.evaluate((cfg) => {
    localStorage.setItem("wavvon.audio_profile", cfg);
  }, MUSIC_PROFILE);
}

function connValue(page: Page, key: string) {
  return page
    .locator(".conn-panel .conn-row")
    .filter({ hasText: key })
    .locator(".conn-val");
}

test("a visitor hears the allied hub's room, not just its roster", async ({ page, browser }) => {
  test.skip(
    !CHANNEL || !HOST_URL || !HOST_INVITE,
    "no alliance set up — run e2e-topology's alliancebrowser stage, which sets WAVVON_E2E_ALLIANCE_*",
  );
  test.setTimeout(180000);

  // The far side: a real client on the hub that *hosts* the channel, under a
  // different identity, because the relay keys its participants by pubkey and
  // one identity on both ends of a room is one participant.
  const { context, page: host } = await newMemberPage(browser, uniqueName("Host"), {
    url: HOST_URL!,
    inviteCode: HOST_INVITE!,
  });
  try {
    await transmitContinuously(host);
    await channelButton(host, CHANNEL!).dblclick();
    await expect(host.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`, {
      timeout: 30000,
    });

    await page.goto("/");
    await expectInHub(page);
    await transmitContinuously(page);

    const channel = page
      .locator(".sidebar-alliance-group")
      .locator(".channel-item", { hasText: CHANNEL! });
    await expect(channel).toBeVisible({ timeout: 20000 });

    // Select the row before joining: the connection readout lives in the
    // content area's header, and nothing is selected on this hub yet.
    //
    // Its left edge, not its centre: the 🔊 sits inside the row, and a centre
    // click lands on it — which joins voice a second time and leaves the
    // client dialling the relay with a bind token the first join already
    // spent (`ERR_METHOD_NOT_SUPPORTED` off the relay, and a room that never
    // opens).
    await channel.click({ position: { x: 4, y: 4 } });

    // The join asks first, through `window.confirm`, because the visitor dials
    // the owning hub direct and that hub's operator sees the IP. Playwright
    // dismisses dialogs by default, which aborts the join silently.
    page.on("dialog", (d) => void d.accept());
    await channel.getByRole("button", { name: /Join voice on/ }).click();
    await expect(page.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`, {
      timeout: 40000,
    });

    // The host does the talking, in the foreground: a backgrounded tab's
    // ScriptProcessor is throttled, and both pages cannot be foreground at
    // once. What the visitor has already folded stays folded.
    await host.bringToFront();
    await expect(host.locator(".voice-status-label").first()).toHaveText(`#${CHANNEL}`);
    await page.bringToFront();

    await page.locator(".conn-chip").click({ timeout: 15000 });
    await expect(page.locator(".conn-panel")).toBeVisible();
    await expect(connValue(page, "Packet loss (in)")).toHaveText(/^\d+(\.\d+)? %$/, {
      timeout: 60000,
    });

    // Outbound is deliberately not asserted: the relay measures it and reports
    // it over the *home* hub's socket, which is not the hub this room is on
    // and has counted nothing.
  } finally {
    await context.close();
  }
});
