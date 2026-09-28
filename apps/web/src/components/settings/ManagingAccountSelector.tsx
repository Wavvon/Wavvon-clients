import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import { SettingRow } from "@wavvon/ui";
import type { IdentityRecord } from "@identity/index";

interface Props {
  accounts: IdentityRecord[];
  activeId: string | null;
  selectedId: string;
  onChange: (id: string) => void;
}

// The account every per-account section below (home hubs, devices, passkeys,
// trusted devices, blocked/ignored users) operates on. Defaults to the
// active account and is never persisted — identities are locally-held keys,
// so the client can read and manage any of them without switching; actually
// switching stays a separate, voice-guarded action (AccountsSwitcherSection).
export function ManagingAccountSelector({ accounts, activeId, selectedId, onChange }: Props) {
  const { t } = useTranslation();
  const optionLabel = (a: IdentityRecord) => {
    const label = a.account_label || formatPubkey(a.id);
    return a.id === activeId ? t("settings.account.managing.active_option", { label }) : label;
  };
  const chosen = accounts.find((a) => a.id === selectedId);
  const selected = chosen ? optionLabel(chosen) : formatPubkey(selectedId);
  return (
    <SettingRow
      title={t("settings.account.managing.label")}
      state={selected}
      control={
        <select
          id="managing-account-select"
          aria-label={t("settings.account.managing.label")}
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{optionLabel(a)}</option>
          ))}
        </select>
      }
    />
  );
}
