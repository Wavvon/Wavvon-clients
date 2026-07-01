import { useEffect, useState } from "react";
import type { Report } from "../types";
import { listReports, reviewReport } from "../platform/commands/moderation";
import { formatRelative } from "@wavvon/core";

function truncate(s: string | null, max: number): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function ContentReportsSection() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listReports("pending");
      setReports(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReview(
    reportId: string,
    action: "dismiss" | "delete_message" | "ban_user",
  ) {
    try {
      await reviewReport(reportId, action);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="settings-section">
      <h2>Content Reports</h2>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && reports.length === 0 && (
        <p className="muted">No pending reports.</p>
      )}
      {!loading && reports.length > 0 && (
        <table className="members-table">
          <thead>
            <tr>
              <th>Message preview</th>
              <th>Reporter</th>
              <th>Reason</th>
              <th>Reported</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {truncate(r.message_content, 100)}
                  </span>
                </td>
                <td>
                  <span className="member-pk">{r.reporter_pubkey.slice(0, 8)}</span>
                </td>
                <td>{r.reason}</td>
                <td>{formatRelative(r.reported_at)}</td>
                <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <button
                    className="btn-small btn-secondary"
                    onClick={() => handleReview(r.id, "dismiss")}
                  >
                    Dismiss
                  </button>
                  <button
                    className="btn-small btn-secondary danger"
                    onClick={() => handleReview(r.id, "delete_message")}
                  >
                    Delete message
                  </button>
                  <button
                    className="btn-small btn-secondary danger"
                    onClick={() => handleReview(r.id, "ban_user")}
                  >
                    Ban user
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
