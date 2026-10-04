import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HubRefusal } from "@wavvon/core";

interface Props {
  hubName: string;
  refusal: HubRefusal;
  onRedeemInvite: ((code: string) => Promise<void>) | null;
  onRemoveHub: () => void;
}

export function HubRefusedPanel({ hubName, refusal, onRedeemInvite, onRemoveHub }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      await onRedeemInvite?.(code.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="empty-state pending-approval hub-refused">
      <h1>{t("hub.refused.title")}</h1>
      <p>{t("hub.refused.body", { hub: hubName || t("app.approval.this_hub") })}</p>
      <p className="muted" role="alert">{t("hub.refused.reason", { reason: refusal.reason })}</p>
      {refusal.kind === "invite_required" && onRedeemInvite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void redeem();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("hub.refused.invite_placeholder")}
            aria-label={t("hub.refused.invite_placeholder")}
          />
          <button type="submit" className="primary" disabled={busy || !code.trim()}>
            {t("hub.refused.invite_submit")}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
      <button type="button" className="btn-secondary" onClick={onRemoveHub}>
        {t("hub.refused.remove")}
      </button>
    </div>
  );
}
