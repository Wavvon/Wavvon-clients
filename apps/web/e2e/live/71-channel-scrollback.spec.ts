import { test, expect } from "@playwright/test";
import { channelButton, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P71 — scrollback: a channel opens on its newest page (50 messages) and
// scrolling to the top loads the page before it, keeping the newest in place.
// Before this, everything older than the newest 50 was unreachable from the
// client (Wavvon-clients#202).
//
// The hub allows 30 messages a minute per sender, so the 60 come from three.

test("scrolling to the top of a channel loads older messages", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const name = uniqueName("scrollback");
  const channel = await hubApi<{ id: string }>(page, "/channels", {
    method: "POST",
    body: { name },
  });

  const posters = [page];
  const contexts = [];
  for (const who of ["Scroller A", "Scroller B"]) {
    const { context, page: member } = await newMemberPage(browser, uniqueName(who));
    contexts.push(context);
    posters.push(member);
  }
  try {
    let n = 0;
    for (const poster of posters) {
      for (let i = 0; i < 20; i++) {
        n += 1;
        await hubApi(poster, `/channels/${channel.id}/messages`, {
          method: "POST",
          body: { content: `scroll-${String(n).padStart(2, "0")}` },
        });
      }
    }

    await page.reload();
    await expectInHub(page);
    await channelButton(page, name).click();

    const list = page.locator("ol.messages");
    await expect(list.getByText("scroll-60", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(list.getByText("scroll-11", { exact: true })).toHaveCount(1);
    await expect(list.getByText("scroll-01", { exact: true })).toHaveCount(0);

    // The view anchors at the bottom; jump to the top as a reader scrolling
    // up would arrive there.
    await expect(async () => {
      await list.evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new Event("scroll"));
      });
      await expect(list.getByText("scroll-01", { exact: true })).toHaveCount(1, { timeout: 2000 });
    }).toPass({ timeout: 20000 });

    // Every message exactly once, the newest still there.
    for (const k of ["scroll-01", "scroll-10", "scroll-11", "scroll-60"]) {
      await expect(list.getByText(k, { exact: true })).toHaveCount(1);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
