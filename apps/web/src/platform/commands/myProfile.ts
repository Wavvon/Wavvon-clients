import { hubFetchWithToken } from "../http";
import { getSession, hubSupports } from "../session";
import { getHomeHubDesignation } from "./identity";
import { loadIdentity, masterPubkeyOf } from "../../identity/store";
import type { FavoriteHub } from "@shared/types";

// My member profile on a specific hub — not necessarily the active one. The
// app holds a live session (token) for every connected hub, so reading and
// writing /me on any of them is just a matter of routing to the right
// session instead of the active-hub default.

export interface MyHubProfile {
  display_name: string | null;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
  status_message: string | null;
  activities: string | null;
  accent_color: string | null;
  name_color: string | null;
  cover: string | null;
  favorite_hubs: FavoriteHub[];
  show_hubs: boolean;
  // Earned on that hub, read-only — shown in the editor card as members
  // would see them (labels only).
  badges: string[];
  // MM-DD, never a year. Absent/null when unset or the hub has birthdays
  // disabled (the server omits it entirely in that case).
  birthday: string | null;
}

// The subset of a profile the editor writes back.
export interface MyProfileUpdate {
  display_name: string;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
  status_message: string | null;
  activities: string | null;
  accent_color: string | null;
  name_color: string | null;
  cover: string | null;
  favorite_hubs: FavoriteHub[];
  show_hubs: boolean;
  birthday: string | null;
}

// Thrown when the hub has no live session this run (saved but never
// connected, or offline). The profile editor shows a friendly note for it.
export const NO_HUB_SESSION = "NO_HUB_SESSION";

function sessionOf(hubId: string) {
  const s = getSession(hubId);
  if (!s) throw new Error(NO_HUB_SESSION);
  return s;
}

export async function getMyProfileOnHub(hubId: string, pubkey: string): Promise<MyHubProfile> {
  const s = sessionOf(hubId);
  // The public profile endpoint rather than /me: same member state, plus
  // badges — exactly what other members' profile cards render.
  const res = await hubFetchWithToken(s.hub_url, s.token, `/users/${pubkey}/profile`);
  const p = (await res.json()) as {
    display_name?: string | null;
    avatar?: string | null;
    bio?: string | null;
    pronouns?: string | null;
    status_message?: string | null;
    activities?: string | null;
    accent_color?: string | null;
    name_color?: string | null;
    cover?: string | null;
    favorite_hubs?: FavoriteHub[];
    show_hubs?: boolean;
    badges?: { id: string; label: string }[];
    birthday?: string | null;
  };
  return {
    display_name: p.display_name ?? null,
    avatar: p.avatar ?? null,
    bio: p.bio ?? null,
    pronouns: p.pronouns ?? null,
    status_message: p.status_message ?? null,
    activities: p.activities ?? null,
    accent_color: p.accent_color ?? null,
    name_color: p.name_color ?? null,
    cover: p.cover ?? null,
    favorite_hubs: p.favorite_hubs ?? [],
    show_hubs: p.show_hubs ?? false,
    badges: (p.badges ?? []).map((b) => b.label),
    birthday: p.birthday ?? null,
  };
}

// Partial update of my profile on a hub — only the given fields, with the
// hub's absent=unchanged / empty=clear semantics (null → "" to clear). Used
// by quick inline edits (e.g. the member-card edit) where we don't want to
// resend the whole profile.
export async function patchMyProfileOnHub(
  hubId: string,
  fields: Partial<Record<"display_name" | "bio" | "pronouns" | "status_message" | "activities" | "birthday", string | null>>,
): Promise<void> {
  const s = sessionOf(hubId);
  const body: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) body[k] = v ?? "";
  await hubFetchWithToken(s.hub_url, s.token, "/me", { method: "PATCH", body: JSON.stringify(body) });
}

export async function updateMyProfileOnHub(hubId: string, profile: MyProfileUpdate): Promise<void> {
  const s = sessionOf(hubId);
  // PATCH semantics on the hub: absent = unchanged, "" = clear. Map null to
  // "" so emptying a field in the editor actually clears it hub-side.
  await hubFetchWithToken(s.hub_url, s.token, "/me", {
    method: "PATCH",
    body: JSON.stringify({
      display_name: profile.display_name,
      avatar: profile.avatar ?? "",
      bio: profile.bio ?? "",
      pronouns: profile.pronouns ?? "",
      status_message: profile.status_message ?? "",
      activities: profile.activities ?? "",
      accent_color: profile.accent_color ?? "",
      name_color: profile.name_color ?? "",
      cover: profile.cover ?? "",
      favorite_hubs: profile.favorite_hubs,
      show_hubs: profile.show_hubs,
      birthday: profile.birthday ?? "",
    }),
  });
}

// null = the hub does not offer alliance member discovery; the toggle hides.
export async function getFindableByAllies(hubId: string): Promise<boolean | null> {
  if (!hubSupports(hubId, "alliance.people")) return null;
  const s = sessionOf(hubId);
  const res = await hubFetchWithToken(s.hub_url, s.token, "/me");
  return ((await res.json()) as { findable_by_allies?: boolean }).findable_by_allies ?? false;
}

// Turning it on also hands that hub the signed home-hub list it will be
// looked up by: the hub lists only members whose designation it holds, and an
// ally's DM resolves delivery from it. The list is re-posted as signed, so a
// paired device (which cannot sign one) can do it too.
export async function setFindableByAllies(hubId: string, value: boolean): Promise<void> {
  const s = sessionOf(hubId);
  if (value) {
    const identity = await loadIdentity();
    const list = identity ? await getHomeHubDesignation(masterPubkeyOf(identity)) : null;
    if (list) {
      await hubFetchWithToken(s.hub_url, s.token, `/identity/${list.master_pubkey}/designation`, {
        method: "POST",
        body: JSON.stringify(list),
      });
    }
  }
  await hubFetchWithToken(s.hub_url, s.token, "/me", {
    method: "PATCH",
    body: JSON.stringify({ findable_by_allies: value }),
  });
}
