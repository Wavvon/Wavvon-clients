import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  hubId: string;
  /** null = this hub does not offer the feature; nothing is rendered. */
  load: (hubId: string) => Promise<boolean | null>;
  save: (hubId: string, value: boolean) => Promise<void>;
  /** The same consent switch serves more than one per-hub flag. */
  variant?: "findable" | "widget";
}

// Saves on click, outside the profile draft: the flag is a consent switch with
// its own PATCH, and a stale "Save changes" must not be able to flip it.
const TEXT = {
  findable: {
    label: "settings.profile.findable_by_allies.label",
    hint: "settings.profile.findable_by_allies.hint",
    failed: "settings.profile.findable_by_allies.failed",
  },
  widget: {
    label: "settings.profile.widget_hidden.label",
    hint: "settings.profile.widget_hidden.hint",
    failed: "settings.profile.widget_hidden.failed",
  },
};

export function FindableByAlliesToggle({ hubId, load, save, variant = "findable" }: Props) {
  const text = TEXT[variant];
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
        <span style={{ fontSize: "var(--text-sm)" }}>{t(text.label)}</span>
      </label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t(text.hint)}</p>
      {failed && <p className="error-text">{t(text.failed)}</p>}
    </div>
  );
}
