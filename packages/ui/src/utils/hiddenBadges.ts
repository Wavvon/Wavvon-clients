// Client-side curation of which earned badges show on the profile card and
// certifications list — shared between MyCertificationsSection (the toggle
// UI) and ProfileEditorSection (the live Bio-tab badge display), so both
// respect the same hide/show state.
//
// Deliberately a flat (not per-account-scoped) key: a device-local UI
// preference, not personal-axis data. On multi-account devices this means
// hidden badges are shared across local accounts rather than namespaced per
// account like session/DM state — a known simplification, not a security
// concern (nothing here is sensitive), acceptable until an app wants to
// thread account-scoped storage through as an override.
const HIDDEN_BADGES_KEY = "wavvon.hiddenBadges";

export function loadHiddenBadgeSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_BADGES_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveHiddenBadgeSet(hidden: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_BADGES_KEY, JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable */
  }
}
