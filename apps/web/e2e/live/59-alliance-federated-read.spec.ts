import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P59 — reading a channel that lives on the *other* hub of an alliance, in a
// real client.
//
// Every other alliance coverage is one-sided: 18-admin-cluster creates an
// alliance and shares a channel on the hub it is already on, and the topology
// harness proves the cross-hub read over HTTP. Neither has ever had a browser
// on hub B looking at a channel hosted by hub A — which is the thing an
// alliance is *for*, and the side where a client can get it wrong (the sidebar
// group, the host label, the message fetch that has to go through its own hub).
//
// The alliance cannot be built from inside the browser: it needs two hubs.
// e2e-topology's `alliancebrowser` stage builds it and names the pieces here.

const CHANNEL = process.env.WAVVON_E2E_ALLIANCE_CHANNEL;
const MESSAGE = process.env.WAVVON_E2E_ALLIANCE_MESSAGE;
const HOST_HUB = process.env.WAVVON_E2E_ALLIANCE_HOST_HUB;

test("a channel shared by the allied hub is readable from this one", async ({ page }) => {
  test.skip(
    !CHANNEL || !MESSAGE,
    "no alliance set up — run e2e-topology's alliancebrowser stage, which sets WAVVON_E2E_ALLIANCE_*",
  );

  await page.goto("/");
  await expectInHub(page);

  // The alliance group is a section of its own in the sidebar, and it lists
  // only channels this hub does not host itself.
  const group = page.locator(".sidebar-alliance-group");
  await expect(group).toBeVisible({ timeout: 20000 });

  const channel = group.locator(".channel-item", { hasText: CHANNEL! });
  await expect(channel).toBeVisible({ timeout: 20000 });
  if (HOST_HUB) {
    // The client says whose hub it is. A federated channel that looks local is
    // how somebody posts to the wrong community.
    await expect(channel.locator(".alliance-channel-host")).toHaveText(HOST_HUB);
  }

  // Left edge, not the row's centre: the row carries a "join voice on the
  // other hub" button that calls stopPropagation, and a centre click can land
  // on it and select nothing.
  await channel.click({ position: { x: 12, y: 8 } });
  // The message was posted on the *other* hub, so this asserts the read
  // crossed the boundary and rendered — not that a local channel exists.
  await expect(page.getByText(MESSAGE!)).toBeVisible({ timeout: 20000 });
});
