import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WhisperTarget, WhisperList, WhisperReplyBind } from "../../types";

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
  /** "Don't receive whispers" checkbox, hidden entirely when the handler
   *  is absent (desktop hasn't wired the hub opt-out command yet). */
  whisperOptout?: boolean;
  onSetWhisperOptout?: (enabled: boolean) => void;
  /** Role targets ("whisper to everyone with @officer currently in voice").
   *  Loaded lazily when the Roles tab is first opened; the tab is hidden
   *  entirely when this prop is absent. */
  onListWhisperRoles?: () => Promise<Array<{ id: string; name: string }>>;
  /** Dedicated reply key ("whisper back at whoever whispered me last").
   *  Row hidden entirely when the handler is absent. */
  whisperReplyBind?: WhisperReplyBind;
  onSetWhisperReplyBind?: (bind: WhisperReplyBind) => void;
}

// Human label for a KeyboardEvent.code — mirrors apps/web's PushToTalkSection.
function keyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

/** Compact whisper control shown from the voice footer's "more controls"
 *  entry: pick voice participants or channels to whisper to, and manage
 *  named target lists (save/load/delete). */
export function WhisperPanel({
  voiceParticipants, voiceChannels,
  isWhispering, whisperTargets, whisperLists,
  onStartWhisper, onStopWhisper, onSaveList, onDeleteList, onClose,
  whisperOptout, onSetWhisperOptout, onListWhisperRoles,
  whisperReplyBind, onSetWhisperReplyBind,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<WhisperTarget[]>(whisperTargets);
  const [tab, setTab] = useState<"users" | "channels" | "roles" | "lists">("users");
  const [listName, setListName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [bindingListId, setBindingListId] = useState<string | null>(null);
  const [bindingReply, setBindingReply] = useState(false);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }> | null>(null);

  useEffect(() => {
    if (!bindingReply || !onSetWhisperReplyBind) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      onSetWhisperReplyBind!({ key: e.code, mode: whisperReplyBind?.mode ?? "hold" });
      setBindingReply(false);
    }
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [bindingReply, onSetWhisperReplyBind, whisperReplyBind]);

  useEffect(() => {
    if (tab !== "roles" || roles !== null || !onListWhisperRoles) return;
    onListWhisperRoles().then(setRoles).catch(() => setRoles([]));
  }, [tab, roles, onListWhisperRoles]);

  function toggleTarget(target: WhisperTarget) {
    setSelected(prev =>
      prev.some(s => s.type === target.type && s.id === target.id)
        ? prev.filter(s => !(s.type === target.type && s.id === target.id))
        : [...prev, target]
    );
  }

  function isSelected(target: WhisperTarget) {
    return selected.some(s => s.type === target.type && s.id === target.id);
  }

  useEffect(() => {
    if (!bindingListId) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      const list = whisperLists.find(l => l.id === bindingListId);
      if (list) onSaveList({ ...list, keybind: e.code });
      setBindingListId(null);
    }
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [bindingListId, whisperLists, onSaveList]);

  return (
    <div className="whisper-panel">
      <div className="whisper-panel-header">
        <span className="whisper-panel-title">{t("voice.whisper")}</span>
        <button className="whisper-panel-close" onClick={onClose} aria-label={t("modal.close")} title={t("modal.close")}>✕</button>
      </div>

      {isWhispering && (
        <div className="whisper-active-banner">
          {t("voice.whisper.active", { targets: whisperTargets.map(target => target.label).join(", ") })}
          <button onClick={onStopWhisper}>{t("voice.whisper.stop")}</button>
        </div>
      )}

      <div className="whisper-tabs">
        {(["users", "channels", "roles", "lists"] as const)
          .filter(id => id !== "roles" || onListWhisperRoles)
          .map(id => (
            <button key={id} className={`whisper-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              {t(`voice.whisper.tab.${id}`)}
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
        {tab === "roles" && roles === null && (
          <p className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>{t("voice.whisper.roles_loading")}</p>
        )}
        {tab === "roles" && roles?.map(r => {
          const target: WhisperTarget = { type: "role", id: r.id, label: `@${r.name}` };
          return (
            <label key={r.id} className="whisper-target-item">
              <input type="checkbox" checked={isSelected(target)} onChange={() => toggleTarget(target)} />
              {target.label}
            </label>
          );
        })}
        {tab === "roles" && roles !== null && roles.length === 0 && (
          <p className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>{t("voice.whisper.roles_empty")}</p>
        )}
        {tab === "lists" && whisperLists.map(list => (
          <div key={list.id} className="whisper-list-item-wrap">
            <div className="whisper-list-item">
              <span>{list.name}</span>
              <span className="whisper-list-targets">{list.targets.map(target => target.label).join(", ")}</span>
              <div className="whisper-list-actions">
                <button onClick={() => { onStartWhisper(list.targets); onClose(); }}>{t("voice.whisper")}</button>
                <button onClick={() => onDeleteList(list.id)} aria-label={t("voice.whisper.delete_list")} title={t("voice.whisper.delete_list")}>✕</button>
              </div>
            </div>
            <div className="whisper-list-keybind-row">
              <span className="muted">{t("voice.whisper.key", { key: list.keybind ? keyLabel(list.keybind) : t("voice.whisper.key_none") })}</span>
              <button onClick={() => setBindingListId(list.id)} disabled={bindingListId === list.id}>
                {bindingListId === list.id ? t("voice.whisper.binding") : t("voice.whisper.bind")}
              </button>
              {list.keybind && (
                <>
                  <button onClick={() => onSaveList({ ...list, keybind: undefined })}>{t("modal.clear")}</button>
                  <select
                    value={list.keybindMode ?? "hold"}
                    onChange={e => onSaveList({ ...list, keybindMode: e.target.value as "hold" | "toggle" })}
                  >
                    <option value="hold">{t("voice.whisper.mode.hold")}</option>
                    <option value="toggle">{t("voice.whisper.mode.toggle")}</option>
                  </select>
                </>
              )}
            </div>
          </div>
        ))}
        {tab === "lists" && whisperLists.length === 0 && (
          <p className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>{t("voice.whisper.lists_empty")}</p>
        )}
      </div>

      {tab !== "lists" && selected.length > 0 && (
        <div className="whisper-actions">
          <button className="whisper-start-btn" onClick={() => { onStartWhisper(selected); onClose(); }}>
            {t("voice.whisper.start", { count: selected.length })}
          </button>
          {!showSaveForm ? (
            <button className="whisper-save-btn" onClick={() => setShowSaveForm(true)}>{t("voice.whisper.save_as_list")}</button>
          ) : (
            <div className="whisper-save-form">
              <input
                placeholder={t("voice.whisper.list_name")}
                value={listName}
                onChange={e => setListName(e.target.value)}
                autoFocus
              />
              <button disabled={!listName.trim()} onClick={() => {
                onSaveList({ id: crypto.randomUUID(), name: listName.trim(), targets: selected });
                setShowSaveForm(false); setListName("");
              }}>{t("modal.save")}</button>
              <button onClick={() => { setShowSaveForm(false); setListName(""); }}>{t("modal.cancel")}</button>
            </div>
          )}
        </div>
      )}

      {onSetWhisperReplyBind && (
        <div className="whisper-list-keybind-row whisper-reply-row">
          <span className="muted">{t("voice.whisper.reply_key", { key: whisperReplyBind?.key ? keyLabel(whisperReplyBind.key) : t("voice.whisper.key_none") })}</span>
          <button onClick={() => setBindingReply(true)} disabled={bindingReply}>
            {bindingReply ? t("voice.whisper.binding") : t("voice.whisper.bind")}
          </button>
          {whisperReplyBind?.key && (
            <>
              <button onClick={() => onSetWhisperReplyBind({ mode: whisperReplyBind?.mode ?? "hold" })}>{t("modal.clear")}</button>
              <select
                value={whisperReplyBind?.mode ?? "hold"}
                onChange={e => onSetWhisperReplyBind({ ...whisperReplyBind, mode: e.target.value as "hold" | "toggle" })}
              >
                <option value="hold">{t("voice.whisper.mode.hold")}</option>
                <option value="toggle">{t("voice.whisper.mode.toggle")}</option>
              </select>
            </>
          )}
        </div>
      )}

      {onSetWhisperOptout && (
        <label className="whisper-optout-row">
          <input
            type="checkbox"
            checked={!!whisperOptout}
            onChange={e => onSetWhisperOptout(e.target.checked)}
          />
          {t("voice.whisper.optout")}
        </label>
      )}
    </div>
  );
}
