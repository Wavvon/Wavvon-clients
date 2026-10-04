import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatDate, formatTime } from "@wavvon/core";
import type { AuditLogEntry, AuditLogPage } from "../../types";
import { ErrorRetry } from "../ErrorRetry";

export interface AuditLogSectionActions {
  getAuditLog: (opts: { cursor?: number; limit?: number }) => Promise<AuditLogPage>;
}

interface Props {
  actions: AuditLogSectionActions;
}


/** Entries in the order they arrived, cut into days. The hub sends newest
 *  first, so the days come out newest first too. */
function byDay(entries: AuditLogEntry[]): { day: string; entries: AuditLogEntry[] }[] {
  const out: { day: string; entries: AuditLogEntry[] }[] = [];
  for (const e of entries) {
    const day = formatDate(e.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else out.push({ day, entries: [e] });
  }
  return out;
}

export function AuditLogSection({ actions }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(next?: number) {
    setLoading(true);
    setError(null);
    try {
      const page = await actions.getAuditLog({ cursor: next, limit: 50 });
      setEntries((prev) => (next == null ? page.entries : [...prev, ...page.entries]));
      setCursor(page.next_cursor);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <h1>{t("hub.admin.audit.title")}</h1>
      <p className="muted">{t("hub.admin.audit.hint")}</p>
      {error && entries.length > 0 && <p className="error-text">{error}</p>}

      {entries.length === 0 && !loading && error ? (
        <ErrorRetry message={error} onRetry={() => load()} />
      ) : entries.length === 0 && !loading ? (
        <p className="muted">{t("hub.admin.audit.empty")}</p>
      ) : (
        <div style={{ marginTop: "var(--space-3)" }}>
          {byDay(entries).map((group) => (
            <div key={group.day} className="audit-day">
              <div className="audit-day-label">{group.day}</div>
              {group.entries.map((e) => (
                <div key={e.seq} className="audit-entry">
                  <span className="audit-entry-time">
                    {formatTime(e.at)}
                  </span>
                  <span className="audit-entry-what">
                    <span className="audit-entry-event">{e.event_type}</span>
                    <span className="audit-entry-who">
                      {e.actor_pubkey
                        ? t("hub.admin.audit.by", { who: formatPubkey(e.actor_pubkey) })
                        : t("hub.admin.audit.by_hub")}
                      {e.target_pubkey ? ` · ${formatPubkey(e.target_pubkey)}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {loading && <p className="muted">{t("hub.admin.audit.loading")}</p>}
      {cursor != null && !loading && (
        <button className="btn-secondary" style={{ marginTop: "var(--space-3)" }} onClick={() => load(cursor)}>
          {t("hub.admin.audit.load_more")}
        </button>
      )}
    </section>
  );
}
