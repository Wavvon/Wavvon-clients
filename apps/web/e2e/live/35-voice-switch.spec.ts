import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P35 — switching voice channels disconnects from the previous one. Before the
// fix, handleVoiceJoin never tore down the current session, so repeated joins
// stacked sessions (you ended up "in" several rooms at once, and the extra
// sessions lingered as stale roster entries).

test("joining a second voice channel leaves the first", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const a = uniqueName("va");
  const b = uniqueName("vb");
  await createChannel(page, a);
  await createChannel(page, b);

  // Join A — a channel row is joined by double-click (see the "Double-click
  // to join voice" row tooltip in SortableItems.tsx), not a header button.
  await channelButton(page, a).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${a}`, { timeout: 15000 });

  // Switch to B — should leave A.
  await channelButton(page, b).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${b}`, { timeout: 15000 });

  // No lingering voice status for A (the "in two rooms at once" bug).
  await expect(page.getByText(`#${a}`, { exact: true })).toHaveCount(0);
});
