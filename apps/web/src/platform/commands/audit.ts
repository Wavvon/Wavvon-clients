import { hubFetch } from "../http";
import { normalizeAuditPage, type AuditLogPage, type AuditLogQuery } from "@wavvon/ui";

// GET /admin/audit-log (ADMIN). Newest first on hubs with `audit.newest`;
// normalizeAuditPage reads either shape.
export async function getAuditLog(opts: AuditLogQuery): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (opts.eventType) params.set("event_type", opts.eventType);
  if (opts.actor) params.set("actor", opts.actor);
  if (opts.cursor != null) params.set("cursor", String(opts.cursor));
  params.set("limit", String(opts.limit));
  const r = await hubFetch(`/admin/audit-log?${params.toString()}`);
  return normalizeAuditPage(await r.json(), opts.limit);
}
