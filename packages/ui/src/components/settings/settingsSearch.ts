import type { SettingsAreaDef, SettingsSectionDef } from "./SettingsShell";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export interface SettingsSearchHit<TSection extends string> {
  id: TSection;
  label: string;
  areaLabel: string;
}

/** Sections whose name or keywords contain every word of the query, across
 *  all areas, label matches first. Accents and case do not matter. */
export function searchSettings<TSection extends string, TArea extends string>(
  sections: SettingsSectionDef<TSection, TArea>[],
  areas: SettingsAreaDef<TArea>[],
  query: string,
  limit = 8,
): SettingsSearchHit<TSection>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { hit: SettingsSearchHit<TSection>; rank: number }[] = [];
  for (const s of sections) {
    const label = fold(s.label);
    const haystack = [label, ...(s.keywords ?? []).map(fold)].join(" ");
    if (!words.every((w) => haystack.includes(w))) continue;
    const areaLabel = areas.find((a) => a.id === s.area)?.label ?? "";
    scored.push({ hit: { id: s.id, label: s.label, areaLabel }, rank: words.every((w) => label.includes(w)) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((x) => x.hit);
}
