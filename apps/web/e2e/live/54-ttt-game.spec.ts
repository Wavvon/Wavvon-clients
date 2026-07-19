import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P54 — the tic-tac-toe demo bot, live (bot-capability-layer.md §7, ROADMAP
// known issue "Tic-tac-toe demo bot needs a live run"). Requires the
// `ttt-bot` process from `server/crates/ttt-bot` (see its README) already
// running and reachable at `HUB_URL`, with `TTT_BOT_PUBKEY` set to its
// printed pubkey. This test performs the admin invite + capability grant
// itself (bot-capability-layer.md §7 step 1) — the bot only needs to be
// running and unauthenticated (or already authenticated) beforehand.

const TTT_BOT_PUBKEY = process.env.TTT_BOT_PUBKEY;

interface BotListEntry {
  pubkey: string;
  commands: Array<{ name: string }>;
}

function launchCard(page: Page) {
  return page.locator(".embed-card").filter({ hasText: "Tic-Tac-Toe" });
}

function gameFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Game"]');
}

async function playMove(page: Page, frame: FrameLocator, cell: number) {
  const btn = frame.locator("#board button").nth(cell);
  await expect(btn).toBeEnabled({ timeout: 20000 });
  await btn.click();
}

test("two players finish a live tic-tac-toe game through the bot's game modal", async ({ page, browser }) => {
  test.setTimeout(180000);
  test.skip(!TTT_BOT_PUBKEY, "TTT_BOT_PUBKEY not set — start server/crates/ttt-bot and export its printed pubkey");

  await page.goto("/");
  await expectInHub(page);

  // Admin invites the bot and grants the game-modal capability.
  await hubApi(page, "/bots", { method: "POST", body: { pubkey: TTT_BOT_PUBKEY } });
  await hubApi(page, `/admin/bots/${TTT_BOT_PUBKEY}/capabilities`, {
    method: "PUT",
    body: { capabilities: ["can_use_interactive_ui"] },
  });

  // The bot's own auth loop retries every 5s while waiting to be invited
  // and only registers its slash command once authenticated — poll rather
  // than sleep a fixed guess.
  await expect
    .poll(
      async () => {
        const bots = await hubApi<BotListEntry[]>(page, "/bots");
        return bots.find((b) => b.pubkey === TTT_BOT_PUBKEY)?.commands.some((c) => c.name === "ttt") ?? false;
      },
      { timeout: 30000 },
    )
    .toBe(true);

  const channel = uniqueName("ttt");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  const opponentName = uniqueName("Opponent");
  const { context, page: opponent } = await newMemberPage(browser, opponentName);
  try {
    await channelButton(opponent, channel).click();

    const composer = page.getByPlaceholder(`Message #${channel}`);
    await composer.fill(`/ttt @${opponentName}`);
    await composer.press("Enter");

    // The bot posts the launch card directly (not the invoker's own typed
    // message — dispatch_slash never stores the raw "/ttt ..." text).
    await expect(launchCard(page)).toBeVisible({ timeout: 15000 });
    await expect(launchCard(opponent)).toBeVisible({ timeout: 15000 });

    await launchCard(page).getByRole("button", { name: "Play" }).click();
    await launchCard(opponent).getByRole("button", { name: "Play" }).click();

    const ownerModal = page.getByRole("dialog", { name: "Game" });
    const opponentModal = opponent.getByRole("dialog", { name: "Game" });
    await expect(ownerModal).toBeVisible({ timeout: 15000 });
    await expect(opponentModal).toBeVisible({ timeout: 15000 });

    const ownerFrame = gameFrame(page);
    const opponentFrame = gameFrame(opponent);

    // The invoker of `/ttt` plays X and always moves first (ttt-bot
    // main.rs GameSession::new). Fill the top row for X, ignoring O's
    // moves (which never block it) so the game reliably ends in a win
    // rather than a draw.
    await playMove(page, ownerFrame, 0);
    await playMove(opponent, opponentFrame, 3);
    await playMove(page, ownerFrame, 1);
    await playMove(opponent, opponentFrame, 4);
    await playMove(page, ownerFrame, 2);

    // The bot detects the win, patches the launch-card message with a result
    // embed, and dismisses every open modal in the channel right away --
    // fast enough that asserting the modal's own transient "You win!" text
    // races the dismiss. Assert the durable outcomes instead: the result
    // embed landing on the (still-visible) launch card, and both modals
    // actually closing.
    await expect(launchCard(page).locator(".embed-description")).toContainText("wins!", { timeout: 15000 });
    await expect(launchCard(opponent).locator(".embed-description")).toContainText("wins!", { timeout: 15000 });
    await expect(ownerModal).not.toBeVisible({ timeout: 15000 });
    await expect(opponentModal).not.toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
