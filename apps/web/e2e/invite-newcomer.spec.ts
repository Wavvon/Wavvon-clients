import { test, expect } from "@playwright/test";

// A friend who followed an invite link creates an identity and goes straight
// in — the 24-word phrase screen is not in the way. Nothing here talks to a
// hub: identity creation is local-only until the join, so this needs no mocks.

test("an invite link creates an identity without stopping at the phrase", async ({ page }) => {
  await page.goto("/join/ABCD1234");
  await page.getByRole("button", { name: "Create new identity" }).click();

  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Save your recovery phrase" })).toHaveCount(0);
});

// The deliberate path still hands over the words: someone who came to create
// an identity, rather than to walk through a door, is asked to save it.
test("without an invite the phrase screen is still the way in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new identity" }).click();

  await expect(page.getByRole("heading", { name: "Save your recovery phrase" })).toBeVisible();
});
