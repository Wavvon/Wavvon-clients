import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatDate, formatTime } from "@wavvon/core";
import type { AuditLogEntry, AuditLogPage } from "../../types";
import { ErrorRetry } from "../ErrorRetry";

export interface AuditLogQuery {
  cursor?: number;
  limit: number;
  eventType?: string;
  actor?: string;
}

export interface AuditLogSectionActions {
  getAuditLog: (opts: AuditLogQuery) => Promise<AuditLogPage>;
}

interface Props {
  actions: AuditLogSectionActions;
  /** Names for the keys in the log; anyone not listed shows as a key. */
  members: { public_key: string; display_name: string | null }[];
  channels: { id: string; name: string }[];
}

const PAGE = 20;

/** The events a hub writes, offered as the type filter. */
const EVENT_TYPES = [
  "channel.created",
  "channel.deleted",
  "channel.permission_overwrite.set",
  "channel.permission_overwrite.cleared",
  "member.joined",
  "member.left",
  "member.kicked",
  "member.banned",
  "message.created",
  "role.appearance_updated",
  "role_category.created",
  "role_category.updated",
  "role_category.deleted",
  "soundboard.clip_uploaded",
  "soundboard.clip_deleted",
];

/**
 * Turn either answer of `GET /admin/audit-log` into one page shape. A hub with
 * `audit.newest` answers a plain array, newest first, and a full page means
 * there may be more; an older one answers `{entries, next_cursor}` oldest
 * first and ignores the filters, which `newestFirst: false` tells the page.
 */
export function normalizeAuditPage(body: unknown, limit: number): AuditLogPage {
  if (Array.isArray(body)) {
    const entries = body as AuditLogEntry[];
    return {
      entries,
      next_cursor: entries.length === limit ? entries[entries.length - 1].seq : null,
      newestFirst: true,
    };
  }
  const env = body as { entries: AuditLogEntry[]; next_cursor: number | null };
  return { entries: env.entries, next_cursor: env.next_cursor, newestFirst: false };
}

interface Run {
  first: AuditLogEntry;
  entries: AuditLogEntry[];
}

/** Days, newest first, each a list of runs: consecutive entries of one event
 *  by one actor (nine channels made in a minute) collapse into one line. */
function byDay(entries: AuditLogEntry[]): { day: string; runs: Run[] }[] {
  const out: { day: string; runs: Run[] }[] = [];
  for (const e of entries) {
    const day = formatDate(e.at);
    let group = out[out.length - 1];
    if (!group || group.day !== day) {
      group = { day, runs: [] };
      out.push(group);
    }
    const run = group.runs[group.runs.length - 1];
    if (run && run.first.event_type === e.event_type && run.first.actor_pubkey === e.actor_pubkey) run.entries.push(e);
    else group.runs.push({ first: e, entries: [e] });
  }
  return out;
}

export function AuditLogSection({ actions, members, channels }: Props) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [filterable, setFilterable] = useState(true);
  const [eventType, setEventType] = useState("");
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(next?: number) {
    setLoading(true);
    setError(null);
    try {
      const page = await actions.getAuditLog({
        cursor: next,
        limit: PAGE,
        eventType: eventType || undefined,
        actor: actor || undefined,
      });
      setEntries((prev) => (next == null ? page.entries : [...prev, ...page.entries]));
      setCursor(page.next_cursor);
      setFilterable(page.newestFirst);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, actor]);

  const nameOf = (pubkey: string | null) =>
    pubkey ? members.find((m) => m.public_key === pubkey)?.display_name || formatPubkey(pubkey) : t("hub.admin.audit.the_hub");

  function sentence(e: AuditLogEntry): string {
    const payload = (e.payload ?? {}) as { name?: string };
    const channel = payload.name ?? channels.find((c) => c.id === e.channel_id)?.name ?? t("hub.admin.audit.deleted_channel");
    const vars = { actor: nameOf(e.actor_pubkey), target: nameOf(e.target_pubkey ?? e.actor_pubkey), channel };
    const key = `hub.admin.audit.event.${e.event_type}`;
    return i18n.exists(key) ? t(key, vars) : t("hub.admin.audit.event_unknown", { ...vars, event: e.event_type });
  }

  return (
    <section>
      <h1>{t("hub.admin.audit.title")}</h1>
      <p className="muted">{t("hub.admin.audit.hint")}</p>
      {filterable && (
        <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
          <select aria-label={t("hub.admin.audit.filter_event")} value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="">{t("hub.admin.audit.filter_event_all")}</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select aria-label={t("hub.admin.audit.filter_actor")} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">{t("hub.admin.audit.filter_actor_all")}</option>
            {members.map((m) => (
              <option key={m.public_key} value={m.public_key}>{m.display_name || formatPubkey(m.public_key)}</option>
            ))}
          </select>
        </div>
      )}
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
              {group.runs.map((run) =>
                run.entries.length === 1 ? (
                  <div key={run.first.seq} className="audit-entry">
                    <span className="audit-entry-time">{formatTime(run.first.at)}</span>
                    <span className="audit-entry-what">{sentence(run.first)}</span>
                  </div>
                ) : (
                  <details key={run.first.seq} className="audit-entry">
                    <summary>
                      <span className="audit-entry-time">{formatTime(run.first.at)}</span>
                      <span className="audit-entry-what">
                        {sentence(run.first)} <span className="muted">{t("hub.admin.audit.and_more", { count: run.entries.length - 1 })}</span>
                      </span>
                    </summary>
                    {run.entries.slice(1).map((e) => (
                      <div key={e.seq} className="audit-entry">
                        <span className="audit-entry-time">{formatTime(e.at)}</span>
                        <span className="audit-entry-what">{sentence(e)}</span>
                      </div>
                    ))}
                  </details>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {loading && <p className="muted">{t("hub.admin.audit.loading")}</p>}
      {cursor != null && !loading && (
        <button className="btn-secondary" style={{ marginTop: "var(--space-3)" }} onClick={() => load(cursor)}>
          {t(filterable ? "hub.admin.audit.load_older" : "hub.admin.audit.load_more")}
        </button>
      )}
    </section>
  );
}
