// Client-side curation of which earned badges show on the profile card and
// certifications list — shared between MyCertificationsSection (the toggle
// UI) and ProfileEditorSection (the live Bio-tab badge display), so both
// respect the same hide/show state.
//
// Flat by default (a device-local UI preference), but callers on
// multi-account devices can pass an accountId to namespace the key the same
// way web's `wavvon:acct:<id>:*` convention does — MyCertificationsSection
// still defaults to the unscoped key when no accountId is supplied.
const HIDDEN_BADGES_KEY = "wavvon.hiddenBadges";

function scopedKey(accountId?: string | null): string {
  return accountId ? `wavvon:acct:${accountId}:${HIDDEN_BADGES_KEY}` : HIDDEN_BADGES_KEY;
}

export function loadHiddenBadgeSet(accountId?: string | null): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(scopedKey(accountId)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveHiddenBadgeSet(hidden: Set<string>, accountId?: string | null): void {
  try {
    localStorage.setItem(scopedKey(accountId), JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable */
  }
}
