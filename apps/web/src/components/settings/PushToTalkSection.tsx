import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface PttConfig {
  enabled: boolean;
  key: string; // KeyboardEvent.code, e.g. "Space", "KeyT"
}

const PTT_KEY = "wavvon.ptt";

export function loadPttConfig(): PttConfig {
  try {
    const raw = localStorage.getItem(PTT_KEY);
    if (raw) return JSON.parse(raw) as PttConfig;
  } catch { /* fall through */ }
  return { enabled: false, key: "Space" };
}

function savePtt(cfg: PttConfig) {
  try {
    localStorage.setItem(PTT_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
  // Let App re-read the config live.
  window.dispatchEvent(new Event("wavvon:ptt"));
}

// Human label for a KeyboardEvent.code.
function keyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function PushToTalkSection() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<PttConfig>(loadPttConfig);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (!binding) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      const next = { ...cfg, key: e.code };
      setCfg(next);
      savePtt(next);
      setBinding(false);
    }
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [binding, cfg]);

  function update(patch: Partial<PttConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    savePtt(next);
  }

  return (
    <div className="settings-section" style={{ marginTop: 16 }}>
      <label className="settings-label">{t("settings.ptt.label")}</label>
      <div className="settings-row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label className="checkbox-label" style={{ margin: 0 }}>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          {t("settings.ptt.enable")}
        </label>
        <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.ptt.key")} <strong>{keyLabel(cfg.key)}</strong></span>
        <button type="button" className="btn-small btn-secondary" onClick={() => setBinding(true)} disabled={binding}>
          {binding ? t("settings.ptt.binding") : t("settings.ptt.change")}
        </button>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        {t("settings.ptt.hint")}
      </p>
    </div>
  );
}
