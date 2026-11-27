import { test, expect } from "@playwright/test";
import { openSettingsSection, openHubAdminSection } from "../helpers/settings";
import { expectInHub, hubApi, newMemberPage, scopedLocalStorageItem, uniqueName } from "./helpers/live";

// P46 — achievement badges. A hub grants a named badge (a labelled cert); it
// lands in the member's cross-hub portfolio, links back to the issuing hub, and
// the member can hide/show it (client-side curation). Supersedes OAuth badges.

type Cert = { payload: { label?: string | null; issuer_url: string }; signature: string };

test("owner defines a badge in the catalogue and grants it; it lands in the member's portfolio", async ({ page, browser }) => {
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
    await openHubAdminSection(page, "Certifications");

    // A hub with the catalogue defines the badge once, then grants it from
    // the badge's own page.
    const badgeName = uniqueName("Raid Leader");
    await page.getByRole("tab", { name: /^Badges/ }).click();
    await page.getByRole("button", { name: "New badge" }).click();
    const create = page.getByRole("dialog", { name: "New badge" });
    await create.getByLabel("Badge icon").fill("🏆");
    await create.getByRole("textbox", { name: "Name", exact: true }).fill(badgeName);
    await create.getByRole("button", { name: "Create", exact: true }).click();
    await expect(create).toBeHidden();

    await page.locator(".badge-row-main", { hasText: badgeName }).click();
    // The badge opens in place of the catalogue.
    const detail = page.locator(".badge-detail");
    await expect(detail.getByRole("heading", { name: badgeName })).toBeVisible();
    await detail.getByRole("button", { name: "Grant to…" }).click();
    await detail.getByLabel("Find a member").fill(memberName);
    await detail.getByRole("checkbox", { name: memberName }).check();
    await detail.getByRole("button", { name: "Grant to 1 member" }).click();
    await expect(detail.locator(".certs-table")).toContainText(memberName);

    // The badge (a labelled cert) is now in the member's portfolio.
    await expect
      .poll(async () => {
        const certs = await hubApi<Cert[]>(page, `/identity/${me.public_key}/certs`);
        return certs.some((c) => c.payload.label === badgeName);
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

    await member.locator(".user-menu-trigger:visible").click();


    await member.getByRole("menu").getByRole("menuitem", { name: "Profile", exact: true }).click();
    await openSettingsSection(member, "Profile");
    const section = member
      .locator(".settings-section", { has: member.getByText("Badges & certifications") })
      .first();
    await expect(section.getByText("Top Contributor")).toBeVisible({ timeout: 10000 });

    // Hide it → the choice persists locally (curation).
    await section.getByRole("button", { name: "Hide" }).first().click();
    await expect
      .poll(async () => (await scopedLocalStorageItem(member, "wavvon.hiddenBadges")) ?? "")
      .toMatch(/[0-9a-f]{16,}/);
  } finally {
    await context.close();
  }
});
