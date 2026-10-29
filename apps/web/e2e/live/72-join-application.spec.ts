import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P72 — the join application (join-forms.md): with one enabled, a newcomer
// lands on the pending screen with the hub's form, cannot send it without the
// required consent, sends it, and waits; once a moderator approves, the hub
// opens up. The application is switched off again whatever happens, since an
// enabled one holds every later spec's newcomer for review.

const FORM = {
  id: "p72-application",
  enabled: true,
  questions: [
    { id: "how", prompt: "How did you find us?", kind: "text", required: true, display_order: 1, multiline: false },
    { id: "adult", prompt: "I am 18 or older", kind: "consent", required: true, display_order: 2,
      help: "This hub is for adults." },
  ],
};

test("a newcomer fills the application and waits for a moderator", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const caps = await hubApi<{ capabilities: string[] }>(page, "/info");
  test.skip(!caps.capabilities.includes("admission.application"), "hub predates join applications");

  await hubApi(page, "/admin/application", { method: "PUT", body: FORM });
  const name = uniqueName("Applicant");
  let context;
  try {
    const joined = await newMemberPage(browser, name);
    context = joined.context;
    const member = joined.page;

    await expect(member.getByText("How did you find us?")).toBeVisible({ timeout: 15000 });
    await expect(member.getByText("This hub is for adults.")).toBeVisible();
    const send = member.getByRole("button", { name: "Submit", exact: true });

    await member.locator("#jf-how").fill("A friend");
    await expect(send).toBeDisabled();
    await member.getByLabel(/I am 18 or older/).check();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(member.getByText(/Your application was sent/)).toBeVisible({ timeout: 10000 });

    // The moderator reads it and lets them in.
    const pending = await hubApi<{ public_key: string; display_name: string | null; has_application: boolean }[]>(
      page, "/hub/pending",
    );
    const entry = pending.find((p) => p.display_name === name);
    expect(entry?.has_application).toBe(true);
    await hubApi(page, `/hub/pending/${entry!.public_key}/approve`, { method: "POST" });

    await member.getByRole("button", { name: /Check again/ }).click();
    await expect(member.getByText(/Your application was sent/)).toBeHidden({ timeout: 15000 });
  } finally {
    await hubApi(page, "/admin/application", { method: "PUT", body: { ...FORM, enabled: false } });
    await context?.close();
  }
});
