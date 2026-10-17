import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Single-shot key capture for push-to-talk. Click → next key press wins. */
export function PttKeyBinder({
  value,
  onChange,
}: {
  value: string;
  onChange: (k: string) => void;
}) {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    function onKey(e: KeyboardEvent) {
      // Modifiers alone are useless as a PTT trigger — you can't hold
      // Shift down without trapping every shifted key. Filter them out.
      if (
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight" ||
        e.code === "ControlLeft" ||
        e.code === "ControlRight" ||
        e.code === "AltLeft" ||
        e.code === "AltRight" ||
        e.code === "MetaLeft" ||
        e.code === "MetaRight"
      ) {
        return;
      }
      e.preventDefault();
      // Capture phase + stop: Escape here only cancels the binding, it must
      // not also reach the app's Escape-closes-settings handler.
      e.stopPropagation();
      if (e.code !== "Escape") onChange(e.code);
      setListening(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);

  return (
    <div className="settings-row" style={{ alignItems: "center" }}>
      <span className="muted">{t("settings.ptt.bound_key")}</span>
      <code className="public-key">{value}</code>
      <button
        className="btn-secondary"
        onClick={() => setListening((v) => !v)}
      >
        {listening ? t("settings.ptt.binding") : t("settings.ptt.rebind")}
      </button>
    </div>
  );
}
