import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, HUB_URL, newMemberPage, uniqueName } from "./helpers/live";

// P68 — a stranger joins an invite-only hub that sits behind a farm.
//
// /info.farm_url sends the client's /auth/verify to the farm, which drops the
// invite code, so the invite has to be redeemed at the hub itself
// (POST /join/{code}). Skips on a hub with no farm in front of it: there the
// code rides /auth/verify and P16 and friends already cover it.

test("a stranger joins an invite-only farm-hosted hub by invite", async ({ browser }) => {
  test.setTimeout(90000);
  const info = (await (await fetch(`${HUB_URL}/info`)).json()) as {
    farm_url?: string | null;
    invite_only?: boolean;
  };
  test.skip(!info.farm_url, "hub has no farm in front of it");
  expect(info.invite_only, "the scenario needs an invite-only hub").toBe(true);

  const { context, page } = await newMemberPage(browser, uniqueName("Stranger"));
  try {
    await expectInHub(page);
    const me = await hubApi<{ public_key: string }>(page, "/me");
    expect(me.public_key).toBeTruthy();
  } finally {
    await context.close();
  }
});
