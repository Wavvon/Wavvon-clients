import { useTranslation } from "react-i18next";

interface Props {
  label: string;
  onSwitch: () => void;
}

// Shown above sections that can only act on the active account (revealing a
// phrase needs its unlocked seed), when the picker names another one: saying
// so beats silently showing the active account's data under another name.
export function ActiveAccountOnlyNotice({ label, onSwitch }: Props) {
  const { t } = useTranslation();
  return (
    <div className="settings-row" role="note" style={{ marginBottom: "var(--space-4)", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <span className="muted">{t("settings.account.active_only", { label })}</span>
      <button className="btn-small" onClick={onSwitch}>{t("settings.account.switch_to", { label })}</button>
    </div>
  );
}
