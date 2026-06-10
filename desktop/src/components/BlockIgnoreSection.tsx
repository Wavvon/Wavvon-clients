import { formatPubkey } from "@voxply/utils";
import type { BlockEntry, IgnoreEntry } from "../types";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

export function BlockIgnoreSection({ blocks, ignores, onUnblock, onUnignore, knownNames }: Props) {
  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">Blocked users ({blocks.length})</label>
        <p className="muted">
          Blocked users cannot DM you. Their messages in shared channels are hidden
          (collapsed — click to reveal). Their audio is muted in voice.
        </p>
        {blocks.length === 0 && <p className="muted">No blocked users.</p>}
        {blocks.map((b) => (
          <div key={b.pubkey} className="settings-row">
            <div>
              <span>{knownNames[b.pubkey] || formatPubkey(b.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                blocked {new Date(b.since * 1000).toLocaleDateString()}
              </span>
            </div>
            <button className="btn-secondary" onClick={() => onUnblock(b.pubkey)}>Unblock</button>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">Ignored users ({ignores.length})</label>
        <p className="muted">
          Ignored users' messages are collapsed in chat (click to reveal). They can
          still DM you and their @mentions still notify you.
        </p>
        {ignores.length === 0 && <p className="muted">No ignored users.</p>}
        {ignores.map((ig) => (
          <div key={ig.pubkey} className="settings-row">
            <div>
              <span>{knownNames[ig.pubkey] || formatPubkey(ig.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                ignored {new Date(ig.since * 1000).toLocaleDateString()}
              </span>
            </div>
            <button className="btn-secondary" onClick={() => onUnignore(ig.pubkey)}>Un-ignore</button>
          </div>
        ))}
      </div>
    </div>
  );
}
