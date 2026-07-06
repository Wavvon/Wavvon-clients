import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@wavvon/ui";
import type { Hub, NamedProfile } from "../types";
import { loadHubProfiles, saveHubProfiles } from "../utils/profiles";
import { AvatarChooser } from "./AvatarChooser";

interface Props {
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  hubs: Hub[];
  onCreate: (label: string, displayName: string, avatar: string | null) => void;
  onUpdate: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onApplyToHub: (id: string) => void;
}

// Named display-name/avatar presets. Create a few (e.g. "Gaming", "Work"),
// apply one to the active hub, or set a default. Per-hub assignment is
// stored locally.
export function ProfilesSection({ profiles, defaultProfileId, hubs, onCreate, onUpdate, onDelete, onSetDefault, onApplyToHub }: Props) {
  const { t } = useTranslation();
  const [newLabel, setNewLabel] = useState("");
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingAvatarFor, setEditingAvatarFor] = useState<string | null>(null);
  const [hubProfiles, setHubProfiles] = useState<Record<string, string>>(loadHubProfiles);

  const activeHub = hubs.find((h) => h.is_active);

  function create() {
    const label = newLabel.trim();
    const name = newName.trim();
    if (!label || !name) return;
    onCreate(label, name, newAvatar);
    setNewLabel(""); setNewName(""); setNewAvatar(null);
  }

  function assignToActiveHub(profileId: string) {
    if (!activeHub) return;
    const next = { ...hubProfiles, [activeHub.hub_id]: profileId };
    setHubProfiles(next);
    saveHubProfiles(next);
    onApplyToHub(profileId);
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Saved profiles</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Presets you can apply to a hub. Applying one updates your display name &amp; avatar on the active hub.
      </p>

      {profiles.length === 0 ? (
        <p className="muted">No saved profiles yet.</p>
      ) : (
        profiles.map((p) => (
          <div key={p.id} className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "var(--space-2)" }}>
            {editing === p.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <input
                  type="text"
                  defaultValue={p.label}
                  aria-label="Profile label"
                  onBlur={(e) => onUpdate(p.id, { label: e.target.value.trim() || p.label })}
                />
                <input
                  type="text"
                  defaultValue={p.display_name}
                  aria-label="Profile display name"
                  onBlur={(e) => onUpdate(p.id, { display_name: e.target.value.trim() || p.display_name })}
                />
                <div className="settings-row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
                  <Avatar src={p.avatar} name={p.display_name} size={40} />
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => setEditingAvatarFor(editingAvatarFor === p.id ? null : p.id)}
                  >
                    {t("profile.avatar_chooser.change_avatar")}
                  </button>
                </div>
                {editingAvatarFor === p.id && (
                  <AvatarChooser
                    value={p.avatar}
                    fallbackName={p.display_name}
                    onChange={(avatar) => {
                      onUpdate(p.id, { avatar });
                      setEditingAvatarFor(null);
                    }}
                    onClear={() => onUpdate(p.id, { avatar: null })}
                  />
                )}
                <button
                  className="btn-small"
                  onClick={() => {
                    setEditing(null);
                    setEditingAvatarFor(null);
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="settings-row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Avatar src={p.avatar} name={p.display_name} size={28} />
                  <span>
                    <strong>{p.label}</strong>
                    {defaultProfileId === p.id && <span className="muted" style={{ fontSize: "var(--text-xs)" }}> · default</span>}
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}> — {p.display_name}</span>
                  </span>
                </span>
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="btn-small" disabled={!activeHub} onClick={() => assignToActiveHub(p.id)}>Apply to hub</button>
                  <button className="btn-small btn-secondary" onClick={() => onSetDefault(p.id)} disabled={defaultProfileId === p.id}>Set default</button>
                  <button className="btn-small btn-secondary" onClick={() => setEditing(p.id)}>Edit</button>
                  <button className="btn-small btn-secondary danger" onClick={() => onDelete(p.id)}>Delete</button>
                </span>
              </div>
            )}
          </div>
        ))
      )}

      <div className="settings-section" style={{ marginTop: "var(--space-2)" }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>New profile</label>
        <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (e.g. Gaming)" aria-label="New profile label" />
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Display name" aria-label="New profile display name" />
        </div>
        <AvatarChooser value={newAvatar} fallbackName={newName} onChange={setNewAvatar} onClear={() => setNewAvatar(null)} />
        <div style={{ marginTop: "var(--space-2)" }}>
          <button onClick={create} disabled={!newLabel.trim() || !newName.trim()}>Create profile</button>
        </div>
      </div>
    </div>
  );
}
