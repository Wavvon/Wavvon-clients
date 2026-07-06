import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AuditEntry } from "../types";
import { formatPubkey, formatRelative, formatFullTimestamp } from "@wavvon/core";

interface Props {
  hubUrl: string;
}

export function HubAuditLogSection({ hubUrl }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<{ entries: AuditEntry[] }>("get_audit_log", { hubUrl })
      .then((res) => setEntries(res.entries ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hubUrl]);

  if (loading) return <p className="muted">Loading audit log…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (entries.length === 0) return <p className="muted">No audit log entries found.</p>;

  return (
    <div>
      <table className="members-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <span title={formatFullTimestamp(entry.ts)}>
                  {formatRelative(entry.ts)}
                </span>
              </td>
              <td>
                <code className="pubkey-display" title={entry.actor_pubkey}>
                  {formatPubkey(entry.actor_pubkey)}
                </code>
              </td>
              <td>{entry.action}</td>
              <td>
                {entry.target ? (
                  <code className="pubkey-display" title={entry.target}>
                    {formatPubkey(entry.target)}
                  </code>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {entry.detail ? (
                  <span className="muted">{entry.detail}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
