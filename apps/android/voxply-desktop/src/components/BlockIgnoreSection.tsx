import React from "react";
import type { BlockEntry, IgnoreEntry } from "../types";
import { formatRelative } from "@voxply/utils";

interface Props {
  blockedUsers: BlockEntry[];
  ignoredUsers: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
}

export function BlockIgnoreSection({ blockedUsers, ignoredUsers, onUnblock, onUnignore }: Props) {
  return (
    <div className="block-ignore-section">
      <div className="settings-section">
        <label className="settings-label">Blocked users</label>
        <p className="muted">Blocked users cannot DM you. Their messages are hidden in shared channels.</p>
        {blockedUsers.length === 0 && <p className="muted">No blocked users.</p>}
        {blockedUsers.map((b) => (
          <div key={b.pubkey} className="settings-row">
            <div>
              <code>{b.pubkey.slice(0, 20)}…</code>
              <span className="muted"> since {formatRelative(b.since)}</span>
            </div>
            <button className="btn-secondary btn-small" onClick={() => onUnblock(b.pubkey)}>
              Unblock
            </button>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">Ignored users</label>
        <p className="muted">Ignored users' messages are hidden in chat. They can still DM you and @mention you.</p>
        {ignoredUsers.length === 0 && <p className="muted">No ignored users.</p>}
        {ignoredUsers.map((i) => (
          <div key={i.pubkey} className="settings-row">
            <div>
              <code>{i.pubkey.slice(0, 20)}…</code>
              <span className="muted"> since {formatRelative(i.since)}</span>
            </div>
            <button className="btn-secondary btn-small" onClick={() => onUnignore(i.pubkey)}>
              Un-ignore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
