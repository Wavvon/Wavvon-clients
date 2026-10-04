import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P67 — capture survives a busy main thread.
//
// Capture used to run in a main-thread ScriptProcessorNode, so a long task on
// the sender cost the room audio. The sender is blocked 200 ms out of every
// 300 ms here and the receiver counts decoded frames (every
// createBufferSource is a datagram that survived receive -> open -> decode).
// 50 frames a second are expected; the assertion is a floor, the numbers are
// printed for comparison.

const MUSIC_PROFILE = JSON.stringify({
  profile: "music", customBitrate: null, customApp: "voip", customNoiseSuppress: true,
  customVad: false, vadThreshold: 0.02, customVadThreshold: 0.02, customChannels: 1,
  customFrameMs: 20, customComplexity: 9,
});

async function transmitContinuously(page: Page) {
  await page.evaluate((cfg) => localStorage.setItem("wavvon.audio_profile", cfg), MUSIC_PROFILE);
}

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 30000 });
}

const probe = () => {
  const w = window as unknown as { __arr: number[] };
  w.__arr = [];
  const orig = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...a) {
    w.__arr.push(performance.now());
    return orig.apply(this, a);
  };
};

async function window_(page: Page, ms: number) {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForTimeout(ms);
  return page.evaluate((from) => {
    const arr = (window as unknown as { __arr: number[] }).__arr.filter((t) => t >= from);
    let max = 0;
    let over100 = 0;
    for (let i = 1; i < arr.length; i++) {
      const g = arr[i] - arr[i - 1];
      if (g > max) max = g;
      if (g > 100) over100++;
    }
    return { frames: arr.length, maxGapMs: Math.round(max), gapsOver100ms: over100 };
  }, t0);
}

test("receiver keeps getting audio while the sender main thread is blocked", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.addInitScript(probe);
  await page.goto("/");
  await expectInHub(page);
  await transmitContinuously(page);
  const channel = uniqueName("load");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: sender } = await newMemberPage(browser, uniqueName("Sender"));
  try {
    await transmitContinuously(sender);
    await joinVoice(sender, channel);
    await page.waitForTimeout(6000);

    const idle = await window_(page, 10000);
    await sender.evaluate(() => {
      setInterval(() => {
        const t = performance.now();
        while (performance.now() - t < 200) { /* busy */ }
      }, 300);
    });
    const loaded = await window_(page, 15000);
    console.log("P67 IDLE  (10s, 500 expected):", JSON.stringify(idle));
    console.log("P67 LOADED(15s, 750 expected):", JSON.stringify(loaded));
    expect(idle.frames).toBeGreaterThan(300);
    expect(loaded.frames).toBeGreaterThan(450);
    expect(loaded.gapsOver100ms).toBeLessThan(5);
  } finally {
    await context.close();
  }
});
