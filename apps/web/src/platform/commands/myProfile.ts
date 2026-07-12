import { hubFetchWithToken } from "../http";
import { getSession } from "../session";

// My member profile on a specific hub — not necessarily the active one. The
// app holds a live session (token) for every connected hub, so reading and
// writing /me on any of them is just a matter of routing to the right
// session instead of the active-hub default.

export interface MyHubProfile {
  display_name: string | null;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
  // Earned on that hub, read-only — shown in the editor card as members
  // would see them (labels only).
  badges: string[];
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
    badges?: { id: string; label: string }[];
  };
  return {
    display_name: p.display_name ?? null,
    avatar: p.avatar ?? null,
    bio: p.bio ?? null,
    pronouns: p.pronouns ?? null,
    badges: (p.badges ?? []).map((b) => b.label),
  };
}

export async function updateMyProfileOnHub(
  hubId: string,
  profile: { display_name: string; avatar: string | null; bio: string | null; pronouns: string | null },
): Promise<void> {
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
    }),
  });
}
