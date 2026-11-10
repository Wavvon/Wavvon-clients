import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName, openSettingRow } from "./helpers/live";

// P77 — roles reorder in one save (clients#286): the admin moves a role up
// with the keyboard path, saves, and the hub holds the new order.

type Role = { id: string; name: string; priority: number };

test("reorder roles with the move buttons and save them in one call", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const caps = (await hubApi<{ capabilities: string[] }>(page, "/info")).capabilities;
  test.skip(!caps.includes("roles.order"), "hub has no PUT /roles/order");

  const names = [uniqueName("High"), uniqueName("Mid"), uniqueName("Low")];
  for (const [i, name] of names.entries()) {
    await hubApi(page, "/roles", { method: "POST", body: { name, priority: 30 - i * 10, permissions: [] } });
  }

  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  const order = await openSettingRow(page, "Order");

  // Low to the top of the three, by keyboard path: up twice.
  await order.getByRole("button", { name: `Move ${names[2]} up` }).click();
  await order.getByRole("button", { name: `Move ${names[2]} up` }).click();
  const put = page.waitForResponse((r) => r.url().endsWith("/roles/order") && r.request().method() === "PUT");
  await order.getByRole("button", { name: "Save order" }).click();
  expect((await put).status()).toBe(200);

  const ours = (await hubApi<Role[]>(page, "/roles"))
    .filter((r) => names.includes(r.name))
    .sort((a, b) => b.priority - a.priority)
    .map((r) => r.name);
  expect(ours).toEqual([names[2], names[0], names[1]]);
});
