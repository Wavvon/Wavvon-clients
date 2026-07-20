import React, { useState } from "react";
import type { WhisperTarget, WhisperList } from "../../types";

interface Props {
  voiceParticipants: Array<{ public_key: string; display_name: string | null }>;
  voiceChannels: Array<{ id: string; name: string }>;
  isWhispering: boolean;
  whisperTargets: WhisperTarget[];
  whisperLists: WhisperList[];
  onStartWhisper: (targets: WhisperTarget[]) => void;
  onStopWhisper: () => void;
  onSaveList: (list: WhisperList) => void;
  onDeleteList: (id: string) => void;
  onClose: () => void;
}

/** Compact whisper control shown from the voice footer's "more controls"
 *  entry: pick voice participants or channels to whisper to, and manage
 *  named target lists (save/load/delete). */
export function WhisperPanel({
  voiceParticipants, voiceChannels,
  isWhispering, whisperTargets, whisperLists,
  onStartWhisper, onStopWhisper, onSaveList, onDeleteList, onClose
}: Props) {
  const [selected, setSelected] = useState<WhisperTarget[]>(whisperTargets);
  const [tab, setTab] = useState<"users" | "channels" | "lists">("users");
  const [listName, setListName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  function toggleTarget(t: WhisperTarget) {
    setSelected(prev =>
      prev.some(s => s.type === t.type && s.id === t.id)
        ? prev.filter(s => !(s.type === t.type && s.id === t.id))
        : [...prev, t]
    );
  }

  function isSelected(t: WhisperTarget) {
    return selected.some(s => s.type === t.type && s.id === t.id);
  }

  return (
    <div className="whisper-panel">
      <div className="whisper-panel-header">
        <span className="whisper-panel-title">Whisper</span>
        <button className="whisper-panel-close" onClick={onClose} aria-label="Close" title="Close">✕</button>
      </div>

      {isWhispering && (
        <div className="whisper-active-banner">
          Whispering to: {whisperTargets.map(t => t.label).join(", ")}
          <button onClick={onStopWhisper}>Stop</button>
        </div>
      )}

      <div className="whisper-tabs">
        {(["users", "channels", "lists"] as const).map(t => (
          <button key={t} className={`whisper-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "users" ? "Users" : t === "channels" ? "Channels" : "Saved Lists"}
          </button>
        ))}
      </div>

      <div className="whisper-target-list">
        {tab === "users" && voiceParticipants.map(p => {
          const target: WhisperTarget = { type: "user", id: p.public_key, label: p.display_name || p.public_key.slice(0, 8) };
          return (
            <label key={p.public_key} className="whisper-target-item">
              <input type="checkbox" checked={isSelected(target)} onChange={() => toggleTarget(target)} />
              {target.label}
            </label>
          );
        })}
        {tab === "channels" && voiceChannels.map(ch => {
          const target: WhisperTarget = { type: "channel", id: ch.id, label: `#${ch.name}` };
          return (
            <label key={ch.id} className="whisper-target-item">
              <input type="checkbox" checked={isSelected(target)} onChange={() => toggleTarget(target)} />
              {target.label}
            </label>
          );
        })}
        {tab === "lists" && whisperLists.map(list => (
          <div key={list.id} className="whisper-list-item">
            <span>{list.name}</span>
            <span className="whisper-list-targets">{list.targets.map(t => t.label).join(", ")}</span>
            <div className="whisper-list-actions">
              <button onClick={() => { onStartWhisper(list.targets); onClose(); }}>Whisper</button>
              <button onClick={() => onDeleteList(list.id)} aria-label="Delete list" title="Delete list">✕</button>
            </div>
          </div>
        ))}
        {tab === "lists" && whisperLists.length === 0 && (
          <p className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>No saved lists yet.</p>
        )}
      </div>

      {tab !== "lists" && selected.length > 0 && (
        <div className="whisper-actions">
          <button className="whisper-start-btn" onClick={() => { onStartWhisper(selected); onClose(); }}>
            Whisper to {selected.length} target{selected.length !== 1 ? "s" : ""}
          </button>
          {!showSaveForm ? (
            <button className="whisper-save-btn" onClick={() => setShowSaveForm(true)}>Save as list</button>
          ) : (
            <div className="whisper-save-form">
              <input
                placeholder="List name"
                value={listName}
                onChange={e => setListName(e.target.value)}
                autoFocus
              />
              <button disabled={!listName.trim()} onClick={() => {
                onSaveList({ id: crypto.randomUUID(), name: listName.trim(), targets: selected });
                setShowSaveForm(false); setListName("");
              }}>Save</button>
              <button onClick={() => { setShowSaveForm(false); setListName(""); }}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
