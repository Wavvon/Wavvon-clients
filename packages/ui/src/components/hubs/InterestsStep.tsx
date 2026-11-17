import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HUB_LANGUAGES, POPULAR_TAGS, type HubInterests } from "../../utils/hubInterests";

export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Onboarding, no-invite path: what kind of hub the newcomer is after. */
export function InterestsStep({ initial, onDone, onSkip }: {
  initial: HubInterests;
  onDone: (v: HubInterests) => void;
  onSkip: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [v, setV] = useState(initial);
  const toggle = (key: "tags" | "languages", item: string) =>
    setV((p) => ({ ...p, [key]: p[key].includes(item) ? p[key].filter((x) => x !== item) : [...p[key], item] }));

  return (
    <>
      <h2>{t("onboarding.interests.title")}</h2>
      <p className="onboarding-lede">{t("onboarding.interests.hint")}</p>
      <h3 className="settings-label">{t("onboarding.interests.tags")}</h3>
      <div className="discover-tag-chips">
        {POPULAR_TAGS.map((tag) => (
          <button key={tag} type="button" className={`discover-tag-chip ${v.tags.includes(tag) ? "active" : ""}`}
            aria-pressed={v.tags.includes(tag)} onClick={() => toggle("tags", tag)}>
            {tag}
          </button>
        ))}
      </div>
      <h3 className="settings-label">{t("onboarding.interests.languages")}</h3>
      <div className="discover-tag-chips">
        {HUB_LANGUAGES.map((code) => (
          <button key={code} type="button" className={`discover-tag-chip ${v.languages.includes(code) ? "active" : ""}`}
            aria-pressed={v.languages.includes(code)} onClick={() => toggle("languages", code)}>
            {languageName(code, i18n.language)}
          </button>
        ))}
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={v.openOnly} onChange={(e) => setV({ ...v, openOnly: e.target.checked })} />
        {t("onboarding.interests.open_only")}
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={v.nearestFirst} onChange={(e) => setV({ ...v, nearestFirst: e.target.checked })} />
        {t("onboarding.interests.nearest_first")}
      </label>
      <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn-primary" onClick={() => onDone(v)}>{t("onboarding.interests.continue")}</button>
        <button className="btn-ghost" onClick={onSkip}>{t("onboarding.later")}</button>
      </div>
    </>
  );
}
