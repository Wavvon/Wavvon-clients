import { describe, expect, it } from "vitest";
import { normalizeAuditPage } from "../admin/AuditLogSection";

const entry = (seq: number) => ({ seq, event_type: "channel.created", at: seq, actor_pubkey: null, target_pubkey: null });

describe("normalizeAuditPage", () => {
  it("reads a newest-first array: a full page has a cursor at its oldest entry, a short one ends", () => {
    expect(normalizeAuditPage([entry(9), entry(8)], 2)).toEqual({ entries: [entry(9), entry(8)], next_cursor: 8, newestFirst: true });
    expect(normalizeAuditPage([entry(7)], 2).next_cursor).toBeNull();
  });

  it("reads an older hub's envelope and says it cannot filter", () => {
    const page = normalizeAuditPage({ entries: [entry(1)], next_cursor: 1 }, 20);
    expect(page).toEqual({ entries: [entry(1)], next_cursor: 1, newestFirst: false });
  });
});
