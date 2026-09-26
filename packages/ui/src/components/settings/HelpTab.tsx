import { useTranslation } from "react-i18next";

// The questions people actually ask once they hit the consequences of
// keypair identity in a browser: where the key lives, what a wipe costs,
// why an invite link drops them somewhere with no account. Prose only —
// every answer is one catalog string, steps separated by newlines.
const FAQ_KEYS = [
  "identity_home",
  "browser_wipe",
  "secure_account",
  "same_client",
  "invite_landing",
  "home_hub",
  "operator_sees",
  "lost_everything",
] as const;

export function HelpTab() {
  const { t } = useTranslation();
  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.help.title")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.help.intro")}</p>

      {FAQ_KEYS.map((k) => (
        <details key={k} className="faq-entry">
          <summary>{t(`settings.help.faq.${k}.q`)}</summary>
          <p className="faq-answer">{t(`settings.help.faq.${k}.a`)}</p>
        </details>
      ))}

      <p className="faq-disclaimer">{t("settings.help.alpha_disclaimer")}</p>
    </div>
  );
}
