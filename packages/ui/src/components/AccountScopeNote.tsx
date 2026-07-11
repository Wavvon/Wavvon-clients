import { useTranslation } from "react-i18next";

// Shared "which account does this belong to" affordance for per-account
// settings sections (home hubs, devices, passkeys, trusted devices,
// blocked/ignored users): a header suffix ("— {label}") plus a short hint
// paragraph. Both are no-ops when there's no label (single-account devices,
// or an account created before labels were mandatory).
interface SuffixProps {
  label?: string | null;
}

export function AccountLabelSuffix({ label }: SuffixProps) {
  if (!label) return null;
  return (
    <span className="muted" style={{ fontWeight: 400 }}>
      {" "}
      — {label}
    </span>
  );
}

interface HintProps extends SuffixProps {
  // i18n key to use for the hint text; must accept a {label} param. Defaults
  // to the generic per-account hint — sections with a more specific story
  // (e.g. home hubs) pass their own key.
  hintKey?: string;
}

export function PerAccountHint({ label, hintKey = "settings.account.per_account_hint" }: HintProps) {
  const { t } = useTranslation();
  if (!label) return null;
  return (
    <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
      {t(hintKey, { label })}
    </p>
  );
}
