import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P89 — a viewer who moves around keeps the live (clients#514).
//
// After a visit to a text channel the live must still decode when the viewer
// comes back, without the sharer restarting. A share opened
// to the whole hub must also survive the viewer joining another voice room.

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-room").first()).toHaveText(`${channel}`, { timeout: 15000 });
}

function decodedWidth(page: Page) {
  return page.evaluate(() => document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream")?.videoWidth ?? 0);
}

async function startShare(page: Page, audience: "room" | "hub") {
  await page.getByRole("button", { name: "Share screen" }).click();
  const dialog = page.getByRole("dialog");
  if (audience === "hub") {
    await dialog.getByRole("radio", { name: "Anyone in the hub, from the live list" }).check();
  }
  await dialog.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.locator(".voice-self-share")).toBeVisible({ timeout: 20000 });
}

test("the live decodes again after the viewer visits a text channel", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expectInHub(page);
  const voice = uniqueName("roam");
  const text = uniqueName("chat");
  await createChannel(page, voice, "Voice channel");
  await createChannel(page, text, "Text");
  await joinVoice(page, voice);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Roamer"));
  try {
    await joinVoice(viewer, voice);
    await startShare(page, "room");

    await viewer.locator(".live-chip").first().click();
    await expect.poll(() => decodedWidth(viewer), { timeout: 60000 }).toBeGreaterThan(0);

    // Away to a text channel (still in the voice room), then back.
    await channelButton(viewer, text).click();
    await expect(viewer.locator(".channel-header, .chat-header").filter({ hasText: text }).first()).toBeVisible({ timeout: 10000 });
    await channelButton(viewer, voice).click();
    const chip = viewer.locator(".live-chip:not(.all)").first();
    await expect(chip).toBeVisible({ timeout: 15000 });
    if (!(await chip.evaluate((el) => el.classList.contains("open")))) await chip.click();
    await expect.poll(() => decodedWidth(viewer), {
      timeout: 30000,
      message: "the live must decode again after the viewer comes back",
    }).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test("a hub-wide live survives the viewer joining another voice room", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expectInHub(page);
  const stage = uniqueName("stage");
  const other = uniqueName("side");
  await createChannel(page, stage, "Voice channel");
  await createChannel(page, other, "Voice channel");
  await joinVoice(page, stage);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Hopper"));
  try {
    await joinVoice(viewer, stage);
    await startShare(page, "hub");
    await viewer.locator(".live-chip").first().click();
    await expect.poll(() => decodedWidth(viewer), { timeout: 60000 }).toBeGreaterThan(0);

    // Into another voice room: the share is the hub's, so the live list still
    // carries it and watching it decodes without the sharer restarting.
    await joinVoice(viewer, other);
    await viewer.getByTitle("Live screen shares").first().click({ timeout: 15000 });
    const panel = viewer.getByRole("dialog", { name: "Live screen shares" });
    // Still subscribed reads "Stop watching"; otherwise watch it again.
    const either = panel.getByRole("button", { name: /^(Watch|Stop watching)$/ });
    await expect(either.first()).toBeVisible({ timeout: 15000 });
    if ((await either.first().textContent())?.trim() === "Watch") await either.first().click();
    await panel.getByRole("button", { name: "Close" }).click();
    await expect.poll(() => decodedWidth(viewer), {
      timeout: 30000,
      message: "the hub-wide live must decode from another voice room",
    }).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
