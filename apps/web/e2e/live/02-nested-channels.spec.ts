import { test, expect, type Page } from "@playwright/test";
import { createChannel, expectInHub, uniqueName, HUB_URL } from "./helpers/live";

// P2 — nested channels UX (nested-channels-ux.md): header breadcrumbs,
// deep-nesting sidebar drill-in (§2), and channel permalinks (§1).

// Create a category nested under the given parent category via the parent
// row's "Add…" button (top-level categories use the hub dropdown instead).
async function createNestedCategory(page: Page, parentName: string, name: string) {
  const parentRow = page.getByRole("group", { name: parentName });
  await parentRow.hover();
  // Child rows nest inside the parent <li>; the parent's own header row
  // comes first, so .first() picks the parent's add button.
  await parentRow.getByRole("button", { name: "+", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("select").selectOption({ label: "Category" });
  await dialog.getByPlaceholder(/channel-name|category-name/).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("group", { name })).toBeVisible();
}

async function createChannelInCategory(page: Page, parentName: string, name: string) {
  const parentRow = page.getByRole("group", { name: parentName });
  await parentRow.hover();
  await parentRow.getByRole("button", { name: "+", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/channel-name|category-name/).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("deep nesting: breadcrumbs, drill-in, and permalink", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  // Build a 5-deep category chain; DRILL_DEPTH=4 puts the drill-in
  // control on the deepest category only.
  const levels = Array.from({ length: 5 }, (_, i) => uniqueName(`cat${i}`));
  await createChannel(page, levels[0], "Category");
  await expect(page.getByRole("group", { name: levels[0] })).toBeVisible();
  for (let i = 1; i < levels.length; i++) {
    await createNestedCategory(page, levels[i - 1], levels[i]);
  }
  const leaf = uniqueName("deep");
  await createChannelInCategory(page, levels[4], leaf);

  // Select the deep channel → header breadcrumb lists the ancestor path.
  await page.getByRole("button", { name: leaf, exact: true }).click();
  const breadcrumb = page.locator(".channel-breadcrumb");
  await expect(breadcrumb).toBeVisible();
  for (const cat of levels) {
    await expect(breadcrumb).toContainText(cat);
  }

  // Drill into the deepest category: sidebar re-roots to the subtree,
  // shallow ancestors leave the list, and a crumb bar appears.
  const drillBtn = page.getByRole("button", { name: `Focus on ${levels[4]}`, exact: true });
  await expect(drillBtn).toBeVisible();
  await drillBtn.click();
  const allChannels = page.getByRole("button", { name: "All channels" });
  await expect(allChannels).toBeVisible();
  await expect(page.getByRole("group", { name: levels[0] })).toBeHidden();
  await expect(page.getByRole("button", { name: leaf, exact: true })).toBeVisible();

  // Back out to the full tree.
  await allChannels.click();
  await expect(page.getByRole("group", { name: levels[0] })).toBeVisible();

  // Permalink round-trip: copy the channel link from the channel's
  // right-click context menu, clear the selection by reloading, then paste
  // the wavvon:// link into the Add Hub modal — for an already-joined hub
  // it must select the channel directly.
  await page.getByRole("button", { name: leaf, exact: true }).click();
  await page.getByRole("button", { name: leaf, exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "Copy channel link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`^wavvon://${new URL(HUB_URL).host}/channel/`));

  await page.reload();
  await expectInHub(page);
  await page.getByRole("navigation", { name: "Hubs" }).getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: "Join a hub" }).click();
  const addHub = page.getByRole("dialog", { name: "Add Hub" });
  await expect(addHub).toBeVisible();
  await addHub.getByRole("textbox").fill(link);
  await expect(addHub).not.toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: `# ${leaf}` })).toBeVisible({ timeout: 10000 });
});
