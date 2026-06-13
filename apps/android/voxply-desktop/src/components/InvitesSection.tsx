import { useState } from "react";
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
      <h1>Invites — {invites.length}</h1>
      <div className="role-editor">
        <h3>Create invite</h3>
        <div className="settings-row">
          <input
            type="number"
            value={maxUsesStr}
            onChange={(e) => setMaxUsesStr(e.target.value)}
            placeholder="Max uses (blank = unlimited)"
            aria-label="Max uses"
            min={1}
          />
          <select
            value={expiryIdx}
            onChange={(e) => setExpiryIdx(Number(e.target.value))}
            aria-label="Expiry"
          >
            {EXPIRY_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                Expires: {o.label}
              </option>
            ))}
          </select>
          <button onClick={submit}>Create</button>
        </div>
      </div>

      {invites.length === 0 ? (
        <p className="muted">No invites yet.</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Uses</th>
              <th>Expires</th>
              <th>Created</th>
              <th>Actions</th>
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
                    : "Never"}
                </td>
                <td>{formatRelative(i.created_at)}</td>
                <td>
                  <button
                    className="btn-small"
                    onClick={() => copyLink(i.code)}
                  >
                    {copied === i.code ? "Copied" : "Copy link"}
                  </button>
                  <button
                    className="btn-small btn-secondary-small"
                    onClick={() => onRevoke(i.code)}
                  >
                    Revoke
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
