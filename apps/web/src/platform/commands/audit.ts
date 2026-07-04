import { hubFetch } from "../http";

export interface AuditLogEntry {
  seq: number;
  event_type: string;
  at: number;
  actor_pubkey: string | null;
  target_pubkey: string | null;
  channel_id: string | null;
  payload: unknown;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  next_cursor: number | null;
}

// GET /admin/audit-log (ADMIN). Cursor-paginated, newest first.
export async function getAuditLog(opts?: {
  eventType?: string;
  cursor?: number;
  limit?: number;
}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (opts?.eventType) params.set("event_type", opts.eventType);
  if (opts?.cursor != null) params.set("cursor", String(opts.cursor));
  params.set("limit", String(opts?.limit ?? 50));
  const r = await hubFetch(`/admin/audit-log?${params.toString()}`);
  return r.json() as Promise<AuditLogPage>;
}
