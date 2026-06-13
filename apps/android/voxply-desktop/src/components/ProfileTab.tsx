import { useEffect, useState } from "react";
import type { Hub, NamedProfile } from "../types";
import { AvatarEditor } from "./AvatarEditor";
import { Avatar } from "@voxply/ui";

const HUB_PROFILES_KEY = "voxply.hubProfiles";

function loadHubProfiles(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(HUB_PROFILES_KEY) ?? "{}"); } catch { return {}; }
}

function saveHubProfiles(map: Record<string, string>) {
  localStorage.setItem(HUB_PROFILES_KEY, JSON.stringify(map));
}

export function ProfileTab({
  hasActiveHub,
  profiles,
  defaultProfileId,
  hubs,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onSetDefaultProfile,
  onApplyProfileToHub,
}: {
  hasActiveHub: boolean;
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  hubs: Hub[];
  onCreateProfile: () => void;
  onUpdateProfile: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultProfileId ?? profiles[0]?.id ?? null,
  );
  const [hubProfiles, setHubProfiles] = useState<Record<string, string>>(loadHubProfiles);

  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedId(null);
    } else if (!profiles.find((p) => p.id === selectedId)) {
      setSelectedId(defaultProfileId ?? profiles[0].id);
    }
  }, [profiles, defaultProfileId, selectedId]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const activeHub = hubs.find((h) => h.is_active);

  function assignHubProfile(hubId: string, profileId: string) {
    const next = { ...hubProfiles, [hubId]: profileId };
    setHubProfiles(next);
    saveHubProfiles(next);
    if (hubId === activeHub?.hub_id) {
      onApplyProfileToHub(profileId);
    }
  }

  return (
    <section>
      <h1>Profile</h1>
      <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
        Create as many profiles as you like — say, one for friends and one for
        work. The one marked Default is what new hubs use automatically.
      </p>

      <div className="settings-section">
        <label className="settings-label">Active profile</label>
        <div className="profile-select-row">
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}{defaultProfileId === p.id ? " (Default)" : ""}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={onCreateProfile}>
            + New
          </button>
        </div>
      </div>

      {selected && (
        <div className="profile-card-editor">
          <div className="profile-card-preview">
            <Avatar src={selected.avatar} name={selected.display_name || selected.label} size={56} />
            <div className="profile-card-preview-text">
              <div className="profile-card-preview-name">{selected.display_name || <span className="muted">no display name</span>}</div>
              <div className="profile-card-preview-label">{selected.label}{defaultProfileId === selected.id ? <span className="profile-default-badge">Default</span> : null}</div>
            </div>
          </div>

          <div className="settings-section profile-editor">
            <div className="profile-editor-row">
              <AvatarEditor
                value={selected.avatar ?? ""}
                onChange={(v) => onUpdateProfile(selected.id, { avatar: v || null })}
                fallbackName={selected.display_name || selected.label}
              />
              <div className="profile-editor-fields">
                <label className="settings-label">Display name</label>
                <input
                  type="text"
                  value={selected.display_name}
                  onChange={(e) => onUpdateProfile(selected.id, { display_name: e.target.value })}
                  placeholder="e.g. Antonio"
                />
                <label className="settings-label" style={{ marginTop: "var(--space-3)" }}>
                  Profile label
                </label>
                <input
                  type="text"
                  value={selected.label}
                  onChange={(e) => onUpdateProfile(selected.id, { label: e.target.value })}
                  placeholder="e.g. Friends, Work, Gaming"
                />
              </div>
            </div>

            <div className="profile-editor-actions">
              {defaultProfileId !== selected.id && (
                <button className="btn-secondary" onClick={() => onSetDefaultProfile(selected.id)}>
                  ★ Set as default
                </button>
              )}
              <button
                onClick={() => onApplyProfileToHub(selected.id)}
                disabled={!hasActiveHub}
                title={hasActiveHub ? "" : "Join a hub first"}
              >
                Apply to this hub
              </button>
              <button
                className="btn-secondary"
                onClick={() => onDeleteProfile(selected.id)}
                disabled={profiles.length <= 1}
                title={profiles.length <= 1 ? "You need at least one profile" : ""}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {hubs.length > 0 && profiles.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">Profile per hub</label>
          <p className="muted">
            Choose which profile to use on each hub. Changing the active hub's
            assignment applies it immediately.
          </p>
          <div className="profile-hub-list">
            {hubs.map((hub) => {
              const assigned = hubProfiles[hub.hub_id] ?? defaultProfileId ?? profiles[0]?.id ?? "";
              const assignedProfile = profiles.find((p) => p.id === assigned);
              return (
                <div key={hub.hub_id} className={`profile-hub-row${hub.is_active ? " active-hub" : ""}`}>
                  <span className="profile-hub-name">
                    {hub.hub_name}
                    {hub.is_active && <span className="profile-hub-active-dot" />}
                  </span>
                  <div className="profile-hub-right">
                    {assignedProfile && (
                      <Avatar src={assignedProfile.avatar} name={assignedProfile.display_name || assignedProfile.label} size={20} />
                    )}
                    <select
                      value={assigned}
                      onChange={(e) => assignHubProfile(hub.hub_id, e.target.value)}
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {profiles.length === 0 && (
        <p className="muted">
          No profiles yet — click <strong>+ New</strong> above to create one.
        </p>
      )}
    </section>
  );
}
