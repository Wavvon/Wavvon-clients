const DRAFTS_KEY = "wavvon.drafts";

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}"); } catch { return {}; }
}

export function saveDraft(key: string, text: string) {
  const drafts = load();
  if (text.trim()) drafts[key] = text;
  else delete drafts[key];
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function loadDraft(key: string): string {
  return load()[key] ?? "";
}

export function clearDraft(key: string) {
  const drafts = load();
  delete drafts[key];
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function hasDraft(key: string): boolean {
  return !!load()[key]?.trim();
}
