import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P73 — reviewing a join application (join-forms.md): the owner opens a
// joiner's answers from the approval queue and rejects them with a reason,
// the joiner reads that reason, and the queue no longer lists them. The
// application is switched off again whatever happens: an enabled one holds
// every later spec's newcomer for review.

const FORM = {
  id: "p73-application",
  enabled: true,
  questions: [
    { id: "why", prompt: "Why do you want to join?", kind: "text", required: true, display_order: 1, multiline: false },
  ],
};

test("a moderator reads an application and rejects it with a reason", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const caps = await hubApi<{ capabilities: string[] }>(page, "/info");
  test.skip(!caps.capabilities.includes("admission.application"), "hub predates join applications");

  await hubApi(page, "/admin/application", { method: "PUT", body: FORM });
  const name = uniqueName("Hopeful");
  let context;
  try {
    const joined = await newMemberPage(browser, name);
    context = joined.context;
    const member = joined.page;
    await member.locator("#jf-why").fill("To play on weekends");
    await member.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(member.getByText(/Your application was sent/)).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expectInHub(page);
    await page.locator(".hub-header-button").click();
    await page.getByRole("button", { name: "Hub settings" }).click();
    await page.getByRole("button", { name: "Members", exact: true }).click();

    const row = page.locator("tr", { hasText: name });
    await row.getByRole("button", { name: "Application", exact: true }).click();
    await expect(page.getByText("To play on weekends")).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/Reason the applicant will read/).fill("Members only from our club");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0, { timeout: 10000 });

    await member.getByRole("button", { name: /Check again/ }).click();
    await expect(member.getByText(/Members only from our club/)).toBeVisible({ timeout: 10000 });
  } finally {
    await hubApi(page, "/admin/application", { method: "PUT", body: { ...FORM, enabled: false } });
    await context?.close();
  }
});
