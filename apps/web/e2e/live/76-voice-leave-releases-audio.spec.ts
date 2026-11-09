import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P76 — joining and leaving voice does not accumulate AudioContexts.
// Chromium keeps a closed context that ever had an AudioWorkletNode alive
// until the page goes away, so a context per join grew by one each time
// (clients#236, then #338 once a newer Chromium kept them even after the
// processor finished). Voice now shares one context for the page's lifetime.
// Counted from the heap after a forced GC, the only place a retained context
// is visible at all.

test("voice join/leave cycles do not accumulate AudioContexts", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expectInHub(page);
  const channel = uniqueName("leak");
  await createChannel(page, channel, "Voice channel");

  const cdp = await page.context().newCDPSession(page);
  const liveContexts = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const proto = await cdp.send("Runtime.evaluate", { expression: "AudioContext.prototype" });
    const found = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId! });
    const len = await cdp.send("Runtime.callFunctionOn", {
      objectId: found.objects.objectId!,
      functionDeclaration: "function () { return this.length; }",
      returnByValue: true,
    });
    return len.result.value as number;
  };

  const cycle = async () => {
    await channelButton(page, channel).dblclick();
    await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 30000 });
    await page.getByRole("button", { name: "Leave voice" }).first().click();
    await expect(page.locator(".voice-status-label")).toHaveCount(0, { timeout: 15000 });
  };

  await cycle();
  await page.waitForTimeout(1000);
  const afterOne = await liveContexts();
  for (let i = 0; i < 5; i++) await cycle();
  await page.waitForTimeout(1000);

  // Two may legitimately remain: the cached one the UI plays its join and
  // leave sounds through, and the one voice shares across sessions.
  const afterSix = await liveContexts();
  expect(afterSix).toBeLessThanOrEqual(2);
  expect(afterSix).toBe(afterOne);
});
