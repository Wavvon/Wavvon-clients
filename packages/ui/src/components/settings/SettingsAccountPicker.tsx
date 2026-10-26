import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { ProfileAccountRef } from "../../types";

interface Props {
  accounts: ProfileAccountRef[];
  activeId: string | null;
  selectedId: string;
  onChange: (id: string) => void;
}

// Whose settings the account-scoped tabs show. One picker in the shell, the
// same on every tab, instead of a "Managing" row whose position changed per
// tab. Never persisted, and choosing never switches accounts: switching
// stays a separate, voice-guarded action.
export function SettingsAccountPicker({ accounts, activeId, selectedId, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <label className="settings-account-picker">
      <span className="settings-nav-group">{t("settings.account.picker.label")}</span>
      <select id="managing-account-select" value={selectedId} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
        {accounts.map((a) => {
          const label = a.account_label || formatPubkey(a.id);
          return (
            <option key={a.id} value={a.id}>
              {a.id === activeId ? t("settings.account.managing.active_option", { label }) : label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
