import { test, expect } from "@playwright/test";
import { createChannel, expectInHub, uniqueName } from "./helpers/live";

// P1 — foundation smoke: restored owner session boots into the hub,
// can create a channel, and can send a message that renders.

test("owner session restores into the hub UI", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await expect(page.locator(".hub-header-name")).not.toHaveText("Hub");
});

test("create a text channel and send a message", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("smoke");
  await createChannel(page, channel);

  // The new channel appears in the sidebar; select it.
  const channelLink = page.getByRole("button", { name: channel, exact: true });
  await expect(channelLink).toBeVisible({ timeout: 10000 });
  await channelLink.click();

  // Send a message and see it render in the pane.
  const body = `hello from playwright ${Date.now()}`;
  const composer = page.getByPlaceholder(`Message #${channel}`);
  await expect(composer).toBeVisible({ timeout: 10000 });
  await composer.fill(body);
  await composer.press("Enter");
  await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
});
