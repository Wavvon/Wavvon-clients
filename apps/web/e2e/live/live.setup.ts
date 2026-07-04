import { test as setup } from "@playwright/test";
import { onboardWithSeed, OWNER_SEED_HEX, OWNER_NAME } from "./helpers/live";

const OWNER_STATE = "e2e/.auth/owner.json";

// Onboard the deterministic owner identity once and persist the session
// (localStorage token + IndexedDB identity) for every live spec.
setup("onboard owner and save session", async ({ page }) => {
  await onboardWithSeed(page, OWNER_SEED_HEX, OWNER_NAME);
  await page.context().storageState({ path: OWNER_STATE, indexedDB: true });
});
