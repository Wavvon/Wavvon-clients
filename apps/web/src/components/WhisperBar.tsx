import { useState } from "react";

export interface WhisperParticipant {
  public_key: string;
  display_name: string | null;
}

interface Props {
  participants: WhisperParticipant[]; // others in voice (excluding me)
  whisperingTo: string[];
  whisperingFrom: Set<string>;
  nameFor: (pubkey: string) => string;
  onStart: (pubkeys: string[]) => void;
  onStop: () => void;
}

// Compact whisper control shown while in voice: pick voice participants to
// whisper to (your mic then reaches only them), and see who is whispering
// to you.
export function WhisperBar({ participants, whisperingTo, whisperingFrom, nameFor, onStart, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const whispering = whisperingTo.length > 0;

  function toggle(pk: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(pk)) n.delete(pk); else n.add(pk);
      return n;
    });
  }

  return (
    <div className="whisper-bar" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
      {whisperingFrom.size > 0 && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--accent)" }}>
          🤫 {[...whisperingFrom].map(nameFor).join(", ")} whispering to you
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {whispering ? (
          <>
            <span style={{ fontSize: "var(--text-sm)" }}>
              🤫 Whispering to {whisperingTo.map(nameFor).join(", ")}
            </span>
            <button className="btn-small" onClick={onStop}>Stop whispering</button>
          </>
        ) : (
          <button
            className="btn-small btn-secondary"
            disabled={participants.length === 0}
            onClick={() => setOpen((v) => !v)}
            title={participants.length === 0 ? "No one else is in voice" : "Whisper to specific people"}
          >
            🤫 Whisper {open ? "▴" : "▾"}
          </button>
        )}
      </div>

      {open && !whispering && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 8 }}>
          {participants.map((p) => (
            <label key={p.public_key} className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
              <input type="checkbox" checked={selected.has(p.public_key)} onChange={() => toggle(p.public_key)} />
              {p.display_name || nameFor(p.public_key)}
            </label>
          ))}
          <div>
            <button
              className="btn-small"
              disabled={selected.size === 0}
              onClick={() => { onStart([...selected]); setOpen(false); }}
            >
              Start whisper
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
