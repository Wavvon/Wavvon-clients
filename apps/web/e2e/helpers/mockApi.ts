import type { Page, Route } from "@playwright/test";

const HUB_URL = "http://localhost:3000";
const HUB_ID = "test-hub-id";
const TOKEN = "test-token";

export async function injectSession(page: Page) {
  await page.addInitScript(
    ({ hubId, hubUrl, token }) => {
      // Saved hubs list
      localStorage.setItem(
        "wavvon:saved_hubs",
        JSON.stringify([
          {
            hub_id: hubId,
            hub_name: "Test Hub",
            hub_url: hubUrl,
            hub_icon: null,
            remember_token: true,
          },
        ])
      );
      // Active hub
      localStorage.setItem("wavvon:active_hub", hubId);
      // Auth token (remember_token=true → localStorage)
      localStorage.setItem(`wavvon:token:${hubId}`, token);
    },
    { hubId: HUB_ID, hubUrl: HUB_URL, token: TOKEN }
  );
}

export function hubRoute(path: string) {
  return `${HUB_URL}${path}`;
}

export async function mockJson(page: Page, url: string, body: unknown, method = "GET") {
  await page.route(url, (route: Route) => {
    if (route.request().method() === method) {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    } else {
      void route.continue();
    }
  });
}

export async function mockEmpty(page: Page, url: string, method = "POST") {
  await page.route(url, (route: Route) => {
    if (route.request().method() === method) {
      void route.fulfill({ status: 204, body: "" });
    } else {
      void route.continue();
    }
  });
}

export { HUB_URL, HUB_ID, TOKEN };
