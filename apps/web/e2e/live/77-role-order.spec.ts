import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName, openRolesAdmin } from "./helpers/live";

// P77 — roles reorder in one call (clients#286): the admin drags a role up
// with the keyboard (dnd-kit: Space picks up, arrows move, Space drops) and
// the hub holds the new order.

type Role = { id: string; name: string; priority: number };

test("reorder roles by keyboard drag and save them in one call", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const caps = (await hubApi<{ capabilities: string[] }>(page, "/info")).capabilities;
  test.skip(!caps.includes("roles.order"), "hub has no PUT /roles/order");

  // Above every other custom role, so the three sit next to each other in
  // the list even when earlier runs left roles behind.
  const top = Math.max(0, ...(await hubApi<Role[]>(page, "/roles"))
    .filter((r) => !r.id.startsWith("builtin-"))
    .map((r) => r.priority));
  const names = [uniqueName("High"), uniqueName("Mid"), uniqueName("Low")];
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const r = await hubApi<Role>(page, "/roles", { method: "POST", body: { name, priority: top + 30 - i * 10, permissions: [] } });
    ids.push(r.id);
  }

  await openRolesAdmin(page);
  const handle = page.getByLabel(`Drag ${names[2]} to reorder`);
  const put = page.waitForResponse((r) => r.url().endsWith("/roles/order") && r.request().method() === "PUT");
  // A key pressed before the previous step lands is lost, so wait for each:
  // the handle is pressed once picked up, and dnd-kit announces every move
  // in a live region.
  const live = page.locator('[id^="DndLiveRegion"]');
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect(live.filter({ hasText: `over droppable area ${ids[1]}` })).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await expect(live.filter({ hasText: `over droppable area ${ids[0]}` })).toHaveCount(1);
  await page.keyboard.press("Space");
  expect((await put).status()).toBe(200);

  const ours = (await hubApi<Role[]>(page, "/roles"))
    .filter((r) => names.includes(r.name))
    .sort((a, b) => b.priority - a.priority)
    .map((r) => r.name);
  expect(ours).toEqual([names[2], names[0], names[1]]);
});
