import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P46 — achievement badges. A hub grants a named badge (a labelled cert); it
// lands in the member's cross-hub portfolio, links back to the issuing hub, and
// the member can hide/show it (client-side curation). Supersedes OAuth badges.

type Cert = { payload: { label?: string | null; issuer_url: string }; signature: string };

test("owner grants a badge via the admin UI; it lands in the member's portfolio", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Ace");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    const me = await hubApi<{ public_key: string }>(member, "/me");

    // Reload so the freshly-joined member appears in the admin members list.
    await page.reload();
    await expectInHub(page);
    await page.locator(".hub-header-button").click();
    await page.getByRole("button", { name: "Hub settings" }).click();
    await page.getByRole("button", { name: "Certifications", exact: true }).click();

    const grant = page.locator(".settings-section", { has: page.getByText("Grant a badge") }).first();
    await expect(grant).toBeVisible({ timeout: 10000 });
    await grant.locator("select").selectOption({ label: memberName });
    await grant.getByLabel("Badge icon").fill("🏆");
    await grant.getByLabel("Badge name").fill("Raid Leader");
    await grant.getByRole("button", { name: "Grant badge" }).click();

    // The badge (a labelled cert) is now in the member's portfolio.
    await expect
      .poll(async () => {
        const certs = await hubApi<Cert[]>(page, `/identity/${me.public_key}/certs`);
        return certs.some((c) => c.payload.label === "Raid Leader");
      }, { timeout: 10000 })
      .toBe(true);
  } finally {
    await context.close();
  }
});

test("a granted badge shows in the member's portfolio and can be hidden", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Star");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    const me = await hubApi<{ public_key: string }>(member, "/me");
    // Grant via the API (the UI grant is covered above); focus here on member view.
    await hubApi(page, `/admin/certs/${me.public_key}/badge`, {
      method: "POST",
      body: { label: "Top Contributor", icon: "⭐" },
    });

    await member.locator(".btn-icon-gear").click();
    await member.getByRole("button", { name: "Profile", exact: true }).click();
    const section = member
      .locator(".settings-section", { has: member.getByText("Badges & certifications") })
      .first();
    await expect(section.getByText("Top Contributor")).toBeVisible({ timeout: 10000 });

    // Hide it → the choice persists locally (curation).
    await section.getByRole("button", { name: "Hide" }).first().click();
    await expect
      .poll(() => member.evaluate(() => localStorage.getItem("wavvon.hiddenBadges") ?? ""))
      .toMatch(/[0-9a-f]{16,}/);
  } finally {
    await context.close();
  }
});
