import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "./helpers/live";

// P36 — deleting a channel/category cascades to every descendant. Previously
// the hub refused (409 "category still has channels"), stranding subchannels.

type Ch = { id: string; name: string };

test("deleting a category deletes its nested channels", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const catName = uniqueName("cascade-cat");
  const childName = uniqueName("cascade-child");
  const grandName = uniqueName("cascade-grand");

  // cat > sub-category > channel (two levels deep, mixed types).
  const cat = await hubApi<Ch>(page, "/channels", {
    method: "POST",
    body: { name: catName, is_category: true },
  });
  const sub = await hubApi<Ch>(page, "/channels", {
    method: "POST",
    body: { name: grandName, is_category: true, parent_id: cat.id },
  });
  const child = await hubApi<Ch>(page, "/channels", {
    method: "POST",
    body: { name: childName, parent_id: sub.id, channel_type: "forum" },
  });

  // Delete the top category — should take the whole subtree.
  await hubApi(page, `/channels/${cat.id}`, { method: "DELETE" });

  const remaining = await hubApi<Ch[]>(page, "/channels");
  const ids = new Set(remaining.map((c) => c.id));
  expect(ids.has(cat.id)).toBe(false);
  expect(ids.has(sub.id)).toBe(false);
  expect(ids.has(child.id)).toBe(false);
});
