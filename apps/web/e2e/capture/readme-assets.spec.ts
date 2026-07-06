import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Captures the README marketing assets (screenshots + join-flow video)
// against a demo-seeded hub. Not part of the regular suites — run it
// explicitly with the dedicated config after seeding a fresh hub:
//
//   # 1. fresh hub on :3100 (own working dir + own Postgres DB), then:
//   #    UPDATE hub_settings SET value='false' WHERE key='invite_only';
//   # 2. HUB_URL=http://localhost:3100 CREDS_OUT=<creds.json> demo-seed
//   # 3. from apps/web:
//   CAPTURE_CREDS=<creds.json> CAPTURE_OUT=<assets-dir> \
//     npx playwright test --config e2e/capture/playwright.capture.config.ts
//
// Screenshots land as screenshot-channel.png / screenshot-dev-talk.png /
// screenshot-game-night.png (1600x1000 @2x = 3200x2000), plus
// join-flow.webm to convert to GIF with ffmpeg.

const HUB_URL = process.env.CAPTURE_HUB_URL ?? "http://localhost:3100";
const CREDS_PATH = process.env.CAPTURE_CREDS ?? "";
const OUT_DIR = process.env.CAPTURE_OUT ?? "";

interface DemoIdentity {
  display_name: string;
  public_key: string;
  secret_key_hex: string;
  session_token: string;
  recovery_phrase: string;
}
interface DemoCreds {
  hub_url: string;
  admin: DemoIdentity;
  members: DemoIdentity[];
}

function loadCreds(): DemoCreds {
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as DemoCreds;
}

function identityByName(creds: DemoCreds, name: string): DemoIdentity {
  const all = [creds.admin, ...creds.members];
  const found = all.find((i) => i.display_name === name);
  if (!found) throw new Error(`No demo identity named ${name}; have: ${all.map((i) => i.display_name).join(", ")}`);
  return found;
}

// First-run onboarding with a recovered identity, then join the demo hub.
// The demo hub already knows each identity's display name, so no name
// prompt appears. demo-seed writes recovery phrases (not seed hex), so we
// recover through the 24-word phrase path.
async function onboard(page: Page, recoveryPhrase: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Recover existing identity" }).click({ timeout: 20000 });
  await page.getByPlaceholder(/word1 word2/).fill(recoveryPhrase);
  await page.getByRole("button", { name: "Recover from phrase" }).click();
  await page.getByPlaceholder(/hub\.example\.com/).fill(HUB_URL);
  await page.getByRole("button", { name: "Join hub" }).click();
  await expect(page.getByRole("button", { name: "Join hub" })).toBeHidden({ timeout: 20000 });
  await expect(page.locator(".hub-header-name")).not.toHaveText("Hub", { timeout: 15000 });
}

async function newIdentityContext(
  browser: Browser,
  identity: DemoIdentity,
  viewport = { width: 1280, height: 800 },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: "http://localhost:1421",
    storageState: { cookies: [], origins: [] },
    viewport,
  });
  const page = await context.newPage();
  await onboard(page, identity.recovery_phrase);
  return { context, page };
}

function channelButton(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^${name}(,| )|^${name}$`) }).first();
}

test.skip(!CREDS_PATH || !OUT_DIR, "set CAPTURE_CREDS and CAPTURE_OUT to run the capture");

test("capture README screenshots", async ({ browser }) => {
  test.setTimeout(600000);
  const creds = loadCreds();

  // Four members sit in Lounge voice so the sidebar shows a live roster.
  const voiceNames = ["MidnightOwl", "Stonebeard", "Nova", "ferris_the_crab"];
  const voiceContexts: BrowserContext[] = [];
  for (const name of voiceNames) {
    const { context, page } = await newIdentityContext(browser, identityByName(creds, name));
    voiceContexts.push(context);
    // Double-clicking a channel row in the sidebar joins its voice session.
    await channelButton(page, "Lounge").dblclick();
    await expect(page.locator(".voice-status-bar")).toBeVisible({ timeout: 20000 });
  }

  // The viewer identity the screenshots are taken as.
  const { context, page } = await newIdentityContext(
    browser,
    identityByName(creds, "patches"),
    { width: 1600, height: 1000 },
  );

  for (const [channel, file] of [
    ["general", "screenshot-channel.png"],
    ["dev-talk", "screenshot-dev-talk.png"],
    ["game-night", "screenshot-game-night.png"],
  ] as const) {
    await channelButton(page, channel).click();
    // Let messages, reactions, presence, and the voice roster settle.
    await expect(page.locator(".message").first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, file) });
  }

  await context.close();
  for (const c of voiceContexts) await c.close();
});

test("capture join-flow video", async ({ browser }) => {
  test.setTimeout(300000);
  const context = await browser.newContext({
    baseURL: "http://localhost:1421",
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  // The flow the GIF shows: create an identity, save the phrase, join the
  // hub by URL, pick a name, land in the community.
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Create new identity" }).click();
  await page.waitForTimeout(3000); // linger on the recovery phrase
  await page.getByRole("button", { name: /I saved my phrase/ }).click();
  await page.waitForTimeout(1000);
  await page.getByPlaceholder(/hub\.example\.com/).fill(HUB_URL);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Join hub" }).click();
  await expect(page.getByRole("button", { name: "Join hub" })).toBeHidden({ timeout: 20000 });
  const namePrompt = page.getByText("What should we call you?");
  await namePrompt.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await namePrompt.isVisible()) {
    await page.getByPlaceholder("Your name").pressSequentially("kestrel", { delay: 120 });
    await page.getByRole("button", { name: "Save name" }).click();
  }
  await channelButton(page, "general").click();
  await expect(page.locator(".message").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2500);

  const video = page.video();
  await context.close();
  if (video) {
    const raw = await video.path();
    fs.renameSync(raw, path.join(OUT_DIR, "join-flow.webm"));
  }
});
