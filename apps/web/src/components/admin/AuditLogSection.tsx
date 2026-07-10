import { useEffect, useState } from "react";
import { getAuditLog } from "@platform";
import type { AuditLogEntry } from "@platform";
import { HubApiError } from "../../platform/http";
import { formatPubkey } from "@wavvon/core";
import { ErrorRetry } from "@wavvon/ui";

export function AuditLogSection() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(next?: number) {
    setLoading(true);
    setError(null);
    try {
      const page = await getAuditLog({ cursor: next, limit: 50 });
      setEntries((prev) => (next == null ? page.entries : [...prev, ...page.entries]));
      setCursor(page.next_cursor);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section>
      <h1>Audit log</h1>
      <p className="muted">Administrative actions on this hub, newest first.</p>
      {error && entries.length > 0 && <p className="error-text">{error}</p>}

      {entries.length === 0 && !loading && error ? (
        <ErrorRetry message={error} onRetry={() => load()} />
      ) : entries.length === 0 && !loading ? (
        <p className="muted">No audit entries yet.</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-3)" }}>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.seq}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {new Date(e.at * 1000).toLocaleString()}
                </td>
                <td>{e.event_type}</td>
                <td>{e.actor_pubkey ? <span className="member-pk">{formatPubkey(e.actor_pubkey)}</span> : "—"}</td>
                <td>{e.target_pubkey ? <span className="member-pk">{formatPubkey(e.target_pubkey)}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loading && <p className="muted">Loading…</p>}
      {cursor != null && !loading && (
        <button className="btn-secondary" style={{ marginTop: "var(--space-3)" }} onClick={() => load(cursor)}>
          Load more
        </button>
      )}
    </section>
  );
}
