import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, openSettingRow, uniqueName } from "./helpers/live";

// P25 — onboarding survey: admin builds + enables a survey, a new member
// fills and submits it, and the admin sees the response. Disables the survey
// at the end so it doesn't block later tests' members.

async function openSurveyAdmin(page: Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Survey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Onboarding survey" })).toBeVisible();
}

test("build a survey, a member submits it, admin sees the response", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);
  await openSurveyAdmin(page);

  const prompt1 = uniqueName("Why join");
  const prompt2 = uniqueName("Favorite mode");

  // Scope to the first rendered survey section (the responsive shell renders
  // the admin twice). The tab is three settings rows — enable, questions,
  // answers — and it is an accordion, so each is opened as it is needed.
  const admin = page.locator("section", { has: page.getByRole("heading", { name: "Onboarding survey" }) }).first();

  // A text question and a choice question with two choices.
  const questions = await openSettingRow(page, "Questions");
  await questions.getByRole("button", { name: "+ Text question" }).click();
  await questions.getByRole("textbox", { name: "Question 1 prompt" }).fill(prompt1);
  await questions.getByRole("button", { name: "+ Choice question" }).click();
  await questions.getByRole("textbox", { name: "Question 2 prompt" }).fill(prompt2);
  await questions.getByRole("button", { name: "+ Add choice" }).click();
  await questions.getByRole("button", { name: "+ Add choice" }).click();
  const choiceInputs = questions.getByRole("textbox", { name: "Choice label" });
  await choiceInputs.nth(0).fill("PvP");
  await choiceInputs.nth(1).fill("PvE");
  await questions.getByRole("button", { name: "Save survey" }).click();
  await expect(admin.getByText("Survey saved")).toBeVisible({ timeout: 10000 });

  const enable = await openSettingRow(page, "Enable this survey");
  await enable.getByRole("checkbox", { name: "Enable this survey" }).check();
  await enable.getByRole("button", { name: "Save survey" }).click();
  await expect(admin.getByText("Survey saved")).toBeVisible({ timeout: 10000 });

  // A fresh member is shown the survey on load and submits it.
  const { context, page: member } = await newMemberPage(browser, uniqueName("Recruit"));
  try {
    const modal = member.getByRole("dialog", { name: "A few questions before you join" });
    await expect(modal).toBeVisible({ timeout: 20000 });
    await modal.getByRole("textbox", { name: prompt1 }).fill("For the guild");
    await modal.getByRole("radio").first().check();
    await modal.getByRole("button", { name: "Submit" }).click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    // Admin sees the response.
    await expect.poll(async () => (await hubApi<unknown[]>(page, "/admin/survey/responses")).length, { timeout: 10000 })
      .toBeGreaterThan(0);
  } finally {
    await context.close();
    // Cleanup: disable the survey so later tests' members aren't gated.
    const off = await openSettingRow(page, "Enable this survey");
    await off.getByRole("checkbox", { name: "Enable this survey" }).uncheck();
    await off.getByRole("button", { name: "Save survey" }).click();
    await expect(admin.getByText("Survey saved")).toBeVisible({ timeout: 10000 });
  }
});
