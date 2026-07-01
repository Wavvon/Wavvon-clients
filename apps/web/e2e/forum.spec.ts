import { test, expect } from "@playwright/test";
import { injectSession, mockJson, mockEmpty, hubRoute } from "./helpers/mockApi";

const HUB_URL = "http://localhost:3000";

const FORUM_CHANNEL = {
  id: "ch1",
  name: "General Discussion",
  created_by: "pubkey-admin",
  parent_id: null,
  is_category: false,
  channel_type: "forum" as const,
  banner_url: null,
  banner_file_id: null,
  display_order: 0,
  description: null,
  icon: null,
  color: null,
  custom_icon_svg: null,
  created_at: 1700000000,
};

const ME_INFO = {
  public_key: "my-pubkey",
  display_name: "Tester",
  avatar: null,
  approval_status: "approved",
  roles: [
    { id: "r1", name: "Member", permissions: ["create_posts"], priority: 1 },
  ],
};

const POST_1 = {
  id: "post1",
  channel_id: "ch1",
  author_pubkey: "other-pubkey",
  title: "First Post",
  created_at: 1700000100,
  edited_at: null,
  is_pinned: false,
  is_locked: false,
  reply_count: 0,
  last_activity_at: 1700000100,
  is_deleted: false,
  unread_reply_count: null,
  reactions: [],
  attachments: [],
};

const POST_2 = {
  id: "post2",
  channel_id: "ch1",
  author_pubkey: "other-pubkey",
  title: "Second Post",
  created_at: 1700000200,
  edited_at: null,
  is_pinned: false,
  is_locked: false,
  reply_count: 0,
  last_activity_at: 1700000200,
  is_deleted: false,
  unread_reply_count: null,
  reactions: [],
  attachments: [],
};

const REPLY_1 = {
  id: "reply1",
  post_id: "post1",
  author_pubkey: "other-pubkey",
  body: "First reply body",
  created_at: 1700000150,
  edited_at: null,
  reply_to_id: null,
  is_deleted: false,
  reactions: [],
  attachments: [],
};

const REPLY_2 = {
  id: "reply2",
  post_id: "post1",
  author_pubkey: "my-pubkey",
  body: "Second reply body",
  created_at: 1700000160,
  edited_at: null,
  reply_to_id: null,
  is_deleted: false,
  reactions: [],
  attachments: [],
};

async function setupBaseRoutes(page: import("@playwright/test").Page) {
  await injectSession(page);

  // Hub bootstrap endpoints
  await mockJson(page, `${HUB_URL}/channels`, [FORUM_CHANNEL]);
  await mockJson(page, `${HUB_URL}/users`, []);
  await mockJson(page, `${HUB_URL}/me`, ME_INFO);
  await mockJson(page, `${HUB_URL}/conversations`, []);
  await mockJson(page, `${HUB_URL}/alliances`, []);
  await mockJson(page, `${HUB_URL}/unread`, []);
  await page.route(`${HUB_URL}/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/bots") || url.includes("/voice") || url.includes("/dh-key") || url.includes("/unread")) {
      void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      void route.continue();
    }
  });
}

test.describe("Forum post list", () => {
  test("renders two posts from mocked channel endpoint", async ({ page }) => {
    await setupBaseRoutes(page);
    await mockJson(page, `${HUB_URL}/channels/ch1/posts`, {
      posts: [POST_1, POST_2],
      cursor: undefined,
    });

    await page.goto("/");

    await expect(page.getByText("First Post")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Second Post")).toBeVisible();
  });
});

test.describe("Viewing a post", () => {
  test("renders post title, body, reply count, and reply bodies", async ({ page }) => {
    await setupBaseRoutes(page);
    await mockJson(page, `${HUB_URL}/channels/ch1/posts`, { posts: [POST_1], cursor: undefined });

    const postDetail = {
      ...POST_1,
      body: "This is the post body",
      reply_count: 2,
      replies: [REPLY_1, REPLY_2],
    };
    await mockJson(page, `${HUB_URL}/posts/post1`, postDetail);
    await mockEmpty(page, `${HUB_URL}/channels/ch1/posts/post1/read`, "POST");

    await page.goto("/");
    await page.getByText("First Post").click();

    await expect(page.getByRole("heading", { name: "First Post" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("This is the post body")).toBeVisible();
    await expect(page.getByText(/2 replies/)).toBeVisible();
    await expect(page.getByText("First reply body")).toBeVisible();
    await expect(page.getByText("Second reply body")).toBeVisible();
  });
});

test.describe("Reactions on a post", () => {
  test("shows reaction chip and calls add-reaction endpoint on click", async ({ page }) => {
    await setupBaseRoutes(page);
    await mockJson(page, `${HUB_URL}/channels/ch1/posts`, { posts: [POST_1], cursor: undefined });

    const postWithReaction = {
      ...POST_1,
      body: "Post with reaction",
      reply_count: 0,
      replies: [],
      reactions: [{ emoji: "👍", count: 3, me: false }],
    };
    await mockJson(page, `${HUB_URL}/posts/post1`, postWithReaction);
    await mockEmpty(page, `${HUB_URL}/channels/ch1/posts/post1/read`, "POST");

    let reactionBody: string | null = null;
    await page.route(`${HUB_URL}/posts/post1/reactions`, (route) => {
      if (route.request().method() === "POST") {
        reactionBody = route.request().postData();
        void route.fulfill({ status: 204, body: "" });
      } else {
        void route.continue();
      }
    });
    // After adding, return updated post
    let callCount = 0;
    await page.route(`${HUB_URL}/posts/post1`, (route) => {
      if (route.request().method() === "GET") {
        callCount++;
        const body = callCount === 1 ? postWithReaction : { ...postWithReaction, reactions: [{ emoji: "👍", count: 4, me: true }] };
        void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      } else {
        void route.continue();
      }
    });

    await page.goto("/");
    await page.getByText("First Post").click();

    const chip = page.getByRole("button", { name: /👍 3/ });
    await expect(chip).toBeVisible({ timeout: 8000 });
    await chip.click();

    await expect(async () => {
      expect(reactionBody).toContain('"emoji":"👍"');
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Toggling off a reaction", () => {
  test("active reaction chip has active class and calls delete endpoint on click", async ({ page }) => {
    await setupBaseRoutes(page);
    await mockJson(page, `${HUB_URL}/channels/ch1/posts`, { posts: [POST_1], cursor: undefined });

    const postWithMyReaction = {
      ...POST_1,
      body: "Post I reacted to",
      reply_count: 0,
      replies: [],
      reactions: [{ emoji: "👍", count: 2, me: true }],
    };
    await mockJson(page, `${HUB_URL}/posts/post1`, postWithMyReaction);
    await mockEmpty(page, `${HUB_URL}/channels/ch1/posts/post1/read`, "POST");

    let deleteCalled = false;
    await page.route(`${HUB_URL}/posts/post1/reactions/**`, (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        void route.fulfill({ status: 204, body: "" });
      } else {
        void route.continue();
      }
    });

    await page.goto("/");
    await page.getByText("First Post").click();

    const chip = page.getByRole("button", { name: /👍 2/ });
    await expect(chip).toBeVisible({ timeout: 8000 });
    await expect(chip).toHaveClass(/active/);
    await chip.click();

    await expect(async () => {
      expect(deleteCalled).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Reactions on a reply", () => {
  test("renders reaction chip on reply row", async ({ page }) => {
    await setupBaseRoutes(page);
    await mockJson(page, `${HUB_URL}/channels/ch1/posts`, { posts: [POST_1], cursor: undefined });

    const replyWithReaction = {
      ...REPLY_1,
      reactions: [{ emoji: "❤️", count: 1, me: false }],
    };
    const postDetail = {
      ...POST_1,
      body: "Post body",
      reply_count: 1,
      replies: [replyWithReaction],
    };
    await mockJson(page, `${HUB_URL}/posts/post1`, postDetail);
    await mockEmpty(page, `${HUB_URL}/channels/ch1/posts/post1/read`, "POST");

    await page.goto("/");
    await page.getByText("First Post").click();

    await expect(page.getByText("First reply body")).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /❤️ 1/ })).toBeVisible();
  });
});
