import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P21 — whisper (targeted voice). Two clients join voice; the owner whispers
// to the member. Verifies the control plane end-to-end: the target receives
// voice_whisper_started and shows the whispering indicator on their
// participant row. (Audio isolation is enforced server-side in voice_ws.rs;
// not asserted here.)

// Whisper controls live in the voice-session footer, opened via the shared
// WhisperPanel (packages/ui/src/components/voice/WhisperPanel.tsx) — a
// channel row is joined by double-click (see the "Double-click to join
// voice" row tooltip in SortableItems.tsx), not a header button.
async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
  await expect(page.getByTitle("Whisper")).toBeVisible({ timeout: 15000 });
}

test("owner whispers to a member; the member sees the indicator", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("whisper");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("WhisperMate"));
  try {
    await joinVoice(member, channel);
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });

    // Owner opens the whisper panel, selects the one participant (Users tab
    // is the default), and starts whispering.
    await page.getByTitle("Whisper").click();
    const panel = page.locator(".whisper-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.locator('input[type="checkbox"]').first().check();
    // Starting the whisper closes the panel (by design — see WhisperPanel's
    // start button). The active banner lives inside the panel, so it is
    // asserted after re-opening below.
    await panel.getByRole("button", { name: /Whisper to \d+ target/ }).click();
    await expect(panel).toBeHidden();

    // The member receives voice_whisper_started → sees the badge on the
    // owner's participant row.
    await expect(member.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });

    // Re-open the panel: it shows the active-whisper banner.
    await page.getByTitle("Whisper").click();
    await expect(page.locator(".whisper-active-banner")).toBeVisible();

    // Owner stops → the member's indicator clears.
    await page.locator(".whisper-active-banner").getByRole("button", { name: "Stop" }).click();
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});

// Owner starts + stops a user-target whisper aimed at the first (only)
// participant in the panel's Users tab. Shared by the round-2 tests below.
async function startWhisperAtFirstUser(page: Page) {
  await page.getByTitle("Whisper").click();
  const panel = page.locator(".whisper-panel");
  await expect(panel).toBeVisible({ timeout: 15000 });
  await panel.locator(".whisper-target-item input").first().check();
  await panel.getByRole("button", { name: /Whisper to \d+ target/ }).click();
  await expect(panel).toBeHidden();
}

async function stopWhisper(page: Page) {
  await page.getByTitle("Whisper").click();
  await page.locator(".whisper-active-banner").getByRole("button", { name: "Stop" }).click();
  await page.locator(".whisper-panel .whisper-panel-close").click();
}

test("whisper inbox: entry persists after the whisper ends, until dismissed", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("wbox");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("InboxMate"));
  try {
    await joinVoice(member, channel);
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });
    await startWhisperAtFirstUser(page);

    // Live entry while the whisper is running…
    const row = member.locator(".whisper-inbox-row").first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row.locator(".whisper-inbox-status")).toHaveText("is whispering");

    // …flips to ended when the owner stops, but STAYS until dismissed.
    await stopWhisper(page);
    await expect(row.locator(".whisper-inbox-status")).toHaveText("whispered you", { timeout: 15000 });
    await member.waitForTimeout(2000);
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Dismiss" }).click();
    await expect(member.locator(".whisper-inbox")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("receive opt-out blocks a whisper; opting back in mid-session restores it", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("wopt");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("OptoutMate"));
  try {
    await joinVoice(member, channel);
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });

    // Member opts out of receiving whispers.
    await member.getByTitle("Whisper").click();
    const memberPanel = member.locator(".whisper-panel");
    await expect(memberPanel).toBeVisible({ timeout: 15000 });
    await memberPanel.locator(".whisper-optout-row input").check();
    await memberPanel.locator(".whisper-panel-close").click();

    // Owner whispers at the member — the hub excludes opted-out pubkeys
    // from resolution, so no indicator may ever reach the member.
    await startWhisperAtFirstUser(page);
    await member.waitForTimeout(3000);
    await expect(member.locator(".participant-whisper-badge")).toBeHidden();
    await expect(member.locator(".whisper-inbox")).toBeHidden();

    // Member opts back in WHILE the whisper is still running: re-resolution
    // must push voice_whisper_started to them (the 2026-07-26 diffing fix).
    await member.getByTitle("Whisper").click();
    await memberPanel.locator(".whisper-optout-row input").uncheck();
    await memberPanel.locator(".whisper-panel-close").click();
    await expect(member.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });

    await stopWhisper(page);
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});

test("role-target whisper via the Roles tab reaches a role member in voice", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("wrole");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const memberName = uniqueName("RoleMate");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await joinVoice(member, channel);
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });

    // Setup via API (assertions stay in the UI): a role assigned to the
    // member. Their pubkey comes from their own client (the active account
    // id), not a /users scan — the shared e2e hub accumulates users.
    const memberPk = await member.evaluate(() => localStorage.getItem("wavvon:active_account_id"));
    expect(memberPk, "member pubkey from active account id").toBeTruthy();
    const roleName = uniqueName("Raider");
    const role = await hubApi<{ id: string }>(page, "/roles", {
      method: "POST",
      body: { name: roleName, permissions: ["messages.send"], priority: 3 },
    });
    await hubApi(page, `/users/${memberPk}/roles/${role.id}`, { method: "PUT" });

    // Owner whispers to the role from the panel's Roles tab.
    await page.getByTitle("Whisper").click();
    const panel = page.locator(".whisper-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.getByRole("button", { name: "Roles" }).click();
    await panel.locator(".whisper-target-item", { hasText: `@${roleName}` }).locator("input").check();
    await panel.getByRole("button", { name: /Whisper to \d+ target/ }).click();
    await expect(panel).toBeHidden();

    await expect(member.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });

    await stopWhisper(page);
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});

test("reply key (hold mode): whispers back at the last whisperer", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("wreply");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("ReplyMate"));
  try {
    await joinVoice(member, channel);
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });

    // Member binds F10 as their reply key (hold is the default mode).
    await member.getByTitle("Whisper").click();
    const memberPanel = member.locator(".whisper-panel");
    await expect(memberPanel).toBeVisible({ timeout: 15000 });
    await memberPanel.locator(".whisper-reply-row").getByRole("button", { name: "Bind key" }).click();
    await member.keyboard.press("F10");
    await expect(memberPanel.locator(".whisper-reply-row").getByText("Reply key: F10")).toBeVisible();
    await memberPanel.locator(".whisper-panel-close").click();

    // Owner whispers the member, then stops — the inbox entry persists, so
    // the reply key still knows who to answer.
    await startWhisperAtFirstUser(page);
    await expect(member.locator(".whisper-inbox-row").first()).toBeVisible({ timeout: 15000 });
    await stopWhisper(page);
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });

    // Member holds F10 → the OWNER sees the whisper indicator; release → clears.
    await member.keyboard.down("F10");
    await expect(page.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });
    await member.keyboard.up("F10");
    await expect(page.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});

test("per-list keybind (hold mode): whispers while the key is held", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("wkey");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("KeybindMate"));
  try {
    await joinVoice(member, channel);
    // The owner must see the member in voice before the panel's Users tab
    // can list them (regression guard: a stale users-roster `online` flag
    // used to filter live voice participants out of every list).
    await expect(channelButton(page, channel)).toHaveAccessibleName(/2 (people|persons) in voice/, { timeout: 15000 });

    // Owner saves the member as a whisper list and binds F9 (hold is the default mode).
    await page.getByTitle("Whisper").click();
    const panel = page.locator(".whisper-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.locator(".whisper-target-item input").first().check();
    await panel.getByRole("button", { name: "Save as list" }).click();
    await panel.getByPlaceholder("List name").fill("kb-e2e");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await panel.getByRole("button", { name: "Saved Lists" }).click();
    const keybindRow = panel.locator(".whisper-list-keybind-row").first();
    await keybindRow.getByRole("button", { name: "Bind key" }).click();
    await page.keyboard.press("F9");
    await expect(keybindRow.getByText("Key: F9")).toBeVisible();
    await panel.locator(".whisper-panel-close").click();

    // Hold F9 → whisper starts; release → stops.
    await page.keyboard.down("F9");
    await expect(member.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });
    await page.keyboard.up("F9");
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
