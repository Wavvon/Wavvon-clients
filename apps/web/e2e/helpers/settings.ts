import type { Page } from "@playwright/test";

// Which area of user settings holds each section (English labels), so a spec
// can ask for a section by the name it always had.
const AREA_OF: Record<string, string> = {
  Profile: "Profile",
  "Trusted issuers": "Profile",
  Voice: "Audio and video",
  Camera: "Audio and video",
  Appearance: "App",
  Notifications: "App",
  "About & credits": "App",
  "Manage accounts": "Account and security",
  Devices: "Account and security",
  "Blocked and ignored": "Blocked and ignored",
};

/** Opens a user-settings section: its area tab, then its entry in the index
 *  when the area has more than one section. */
export async function openSettingsSection(page: Page, section: string) {
  const area = AREA_OF[section];
  if (!area) throw new Error(`unknown settings section: ${section}`);
  await page.locator(".settings-areas").getByRole("button", { name: area, exact: true }).click();
  const index = page.locator(".settings-index");
  if (await index.count()) {
    await index.getByRole("button", { name: section, exact: true }).click();
  }
}

// Which area of hub settings holds each section (English labels).
const HUB_AREA_OF: Record<string, string> = {
  Overview: "General", Discovery: "General", Tags: "General", Theme: "General", Languages: "General",
  Invites: "Joining", Onboarding: "Joining", Survey: "Joining", Application: "Joining",
  Members: "People", Roles: "People", Certifications: "People",
  Reports: "Moderation", "Recovery requests": "Moderation", Bans: "Moderation", "Audit log": "Moderation",
  Icons: "Content", "Sticker packs": "Content", "Sticker settings": "Content", Soundboard: "Content",
  Attachments: "Content", "Stored stickers": "Content",
  Alliances: "Connections", Webhooks: "Connections", "Online widget": "Connections",
};

/** Opens a hub-settings section (the settings must already be open). */
export async function openHubAdminSection(page: Page, section: string) {
  const area = HUB_AREA_OF[section];
  if (!area) throw new Error(`unknown hub settings section: ${section}`);
  await page.locator(".settings-areas").getByRole("button", { name: area, exact: true }).click();
  const index = page.locator(".settings-index");
  if (await index.count()) {
    await index.getByRole("button", { name: section, exact: true }).click();
  }
}
