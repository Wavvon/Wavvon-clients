import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
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
  return (
    <div className="settings-section">
      <label className="settings-label" htmlFor="managing-account-select">
        {t("settings.account.managing.label")}
      </label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {t("settings.account.managing.hint")}
      </p>
      <select
        id="managing-account-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        style={{ maxWidth: 320 }}
      >
        {accounts.map((a) => {
          const label = a.account_label || formatPubkey(a.id);
          return (
            <option key={a.id} value={a.id}>
              {a.id === activeId ? t("settings.account.managing.active_option", { label }) : label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
