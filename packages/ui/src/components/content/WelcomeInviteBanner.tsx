import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  hubId: string;
  hubUrl: string;
  loadHubInfo: (hubUrl: string) => Promise<{ welcome_label: string | null; welcome_invite_url: string | null }>;
  isDismissed: (hubId: string) => boolean;
  dismiss: (hubId: string) => void;
}

// Shown at the top of the channel view for a hub whose /info advertises a
// welcome_label (set by the admin). Dismissal persists per hub via the
// caller's own storage (isDismissed/dismiss) so it only needs to be seen once.
export function WelcomeInviteBanner({ hubId, hubUrl, loadHubInfo, isDismissed, dismiss }: Props) {
  const { t } = useTranslation();
  const [welcome, setWelcome] = useState<{ label: string; inviteUrl: string | null } | null>(null);
  const [dismissed, setDismissedState] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWelcome(null);
    setCopied(false);
    setDismissedState(isDismissed(hubId));
    let cancelled = false;
    loadHubInfo(hubUrl)
      .then((info) => {
        if (cancelled) return;
        setWelcome(info.welcome_label ? { label: info.welcome_label, inviteUrl: info.welcome_invite_url } : null);
      })
      .catch(() => { if (!cancelled) setWelcome(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, hubUrl]);

  if (dismissed || !welcome) return null;

  function handleDismiss() {
    setDismissedState(true);
    dismiss(hubId);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--text-sm)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="muted">{t("welcome.server_by", { label: welcome.label })}</span>
        {welcome.inviteUrl && (
          <>
            <span className="muted">{t("welcome.invite_line")}</span>
            <a href={welcome.inviteUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
              {welcome.inviteUrl}
            </a>
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(welcome.inviteUrl ?? "").catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? t("modal.copied") : t("modal.copy")}
            </button>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("modal.close")}
        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--text-md)", lineHeight: 1, padding: "0 4px" }}
      >
        ×
      </button>
    </div>
  );
}
