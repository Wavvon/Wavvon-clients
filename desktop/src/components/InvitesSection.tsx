import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { InviteInfo } from "../types";
import { EXPIRY_OPTIONS } from "../constants";
import { formatRelative } from "@voxply/utils";

export function InvitesSection({
  invites,
  hubUrl,
  onCreate,
  onRevoke,
}: {
  invites: InviteInfo[];
  hubUrl: string;
  onCreate: (maxUses: number | null, expiresInSeconds: number | null) => void;
  onRevoke: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [maxUsesStr, setMaxUsesStr] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  function submit() {
    const parsed = maxUsesStr.trim() ? Number(maxUsesStr) : null;
    const maxUses =
      parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    onCreate(maxUses, EXPIRY_OPTIONS[expiryIdx].seconds);
    setMaxUsesStr("");
    setExpiryIdx(0);
  }

  async function copyLink(code: string) {
    const link = `${hubUrl}#invite=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  return (
    <section>
      <h1>{t("invites.title", { count: invites.length })}</h1>
      <div className="role-editor">
        <h3>{t("invites.create.title")}</h3>
        <div className="settings-row">
          <input
            type="number"
            value={maxUsesStr}
            onChange={(e) => setMaxUsesStr(e.target.value)}
            placeholder={t("invites.create.max_uses_placeholder")}
            aria-label={t("invites.create.max_uses_placeholder")}
            min={1}
          />
          <select
            value={expiryIdx}
            onChange={(e) => setExpiryIdx(Number(e.target.value))}
            aria-label={t("invites.create.expires_label", { defaultValue: "Expiry" })}
          >
            {EXPIRY_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {t("invites.create.expires", { label: o.label })}
              </option>
            ))}
          </select>
          <button onClick={submit}>{t("invites.create.button")}</button>
        </div>
      </div>

      {invites.length === 0 ? (
        <p className="muted">{t("invites.empty")}</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>{t("invites.col.code")}</th>
              <th>{t("invites.col.uses")}</th>
              <th>{t("invites.col.expires")}</th>
              <th>{t("invites.col.created")}</th>
              <th>{t("invites.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.code}>
                <td>
                  <code className="invite-code">{i.code}</code>
                </td>
                <td>
                  {i.uses}
                  {i.max_uses !== null ? ` / ${i.max_uses}` : ""}
                </td>
                <td>
                  {i.expires_at
                    ? new Date(i.expires_at * 1000).toLocaleString()
                    : t("invites.expires.never")}
                </td>
                <td>{formatRelative(i.created_at)}</td>
                <td>
                  <button
                    className="btn-small"
                    onClick={() => copyLink(i.code)}
                  >
                    {copied === i.code ? t("invites.copied") : t("invites.copy")}
                  </button>
                  <button
                    className="btn-small btn-secondary-small"
                    onClick={() => onRevoke(i.code)}
                  >
                    {t("invites.revoke")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
