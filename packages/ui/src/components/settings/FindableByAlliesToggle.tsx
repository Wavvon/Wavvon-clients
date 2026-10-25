import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  hubId: string;
  /** null = this hub does not offer the feature; nothing is rendered. */
  load: (hubId: string) => Promise<boolean | null>;
  save: (hubId: string, value: boolean) => Promise<void>;
}

// Saves on click, outside the profile draft: the flag is a consent switch with
// its own PATCH, and a stale "Save changes" must not be able to flip it.
export function FindableByAlliesToggle({ hubId, load, save }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    setFailed(false);
    load(hubId).then((v) => { if (!cancelled) setValue(v); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId]);

  if (value === null) return null;

  async function toggle(next: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      await save(hubId, next);
      setValue(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section" style={{ marginTop: 16 }}>
      <label className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={value} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <span style={{ fontSize: "var(--text-sm)" }}>{t("settings.profile.findable_by_allies.label")}</span>
      </label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.profile.findable_by_allies.hint")}</p>
      {failed && <p className="error-text">{t("settings.profile.findable_by_allies.failed")}</p>}
    </div>
  );
}
