import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P76 — leaving voice releases the session's AudioContext. The capture
// worklet's processor kept returning true, and Blink keeps an active
// processor's node, and the node's whole context, alive: every join left one
// behind, linearly (clients#236). Counted from the heap after a forced GC,
// the only place a retained context is visible at all.

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

  const cycles = 6;
  for (let i = 0; i < cycles; i++) {
    await channelButton(page, channel).dblclick();
    await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 30000 });
    await page.getByRole("button", { name: "Leave voice" }).first().click();
    await expect(page.locator(".voice-status-label")).toHaveCount(0, { timeout: 15000 });
  }
  await page.waitForTimeout(1000);

  // One context may legitimately remain: the cached one the UI plays its
  // join and leave sounds through.
  expect(await liveContexts()).toBeLessThanOrEqual(1);
});
