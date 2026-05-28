import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  FarmSettings,
  FarmHubEntry,
  FarmUserEntry,
  FarmCreationPolicy,
} from "../types";
import { formatPubkey, formatRelative } from "../utils/format";

export type FarmAdminTab = "general" | "hubs" | "users";

interface Props {
  farmUrl: string;
  tab: FarmAdminTab;
  onTab: (t: FarmAdminTab) => void;
  onClose: () => void;
}

const TAGS = ["gaming", "professional", "creative", "education", "community", "18plus"] as const;

function SuspendDialog({
  hubId,
  hubName,
  onConfirm,
  onCancel,
}: {
  hubId: string;
  hubName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Suspend hub</h3>
        <p className="muted">
          Suspending <strong>{hubName}</strong> blocks all traffic through the
          farm proxy. The hub process stays running.
        </p>
        <label className="settings-label">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason shown to users"
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{ background: "var(--danger)", color: "#fff" }}
            onClick={() => onConfirm(reason)}
          >
            Suspend
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteHubDialog({
  hubName,
  onConfirm,
  onCancel,
}: {
  hubName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete hub</h3>
        <p className="muted">
          Deleting <strong>{hubName}</strong> removes it from the farm directory
          permanently. The hub database is left intact for the operator.
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{ background: "var(--danger)", color: "#fff" }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ farmUrl }: { farmUrl: string }) {
  const [settings, setSettings] = useState<FarmSettings>({
    name: "",
    description: "",
    creation_policy: "admin_only",
    max_hubs_per_user: 5,
    max_hubs_total: 0,
    allow_discovery_listing: false,
    directory_public: false,
    languages: ["en"],
    tags: [],
    country: "",
    region: "",
  });
  const [languageInput, setLanguageInput] = useState("en");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<FarmSettings>("get_farm_settings", { farmUrl })
      .then((s) => {
        setSettings(s);
        setLanguageInput(s.languages.join(", "));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [farmUrl]);

  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");
    const langs = languageInput
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const payload = { ...settings, languages: langs };
    try {
      const updated = await invoke<FarmSettings>("patch_farm_settings", {
        farmUrl,
        settings: payload,
      });
      setSettings(updated);
      setLanguageInput(updated.languages.join(", "));
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveError(String(e));
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tag: string) {
    setSettings((prev) => {
      const has = prev.tags.includes(tag);
      return {
        ...prev,
        tags: has ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
      };
    });
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <h1>General</h1>

      <div className="settings-section">
        <label className="settings-label">Farm name</label>
        <input
          type="text"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          placeholder="My Farm"
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Description</label>
        <textarea
          rows={3}
          value={settings.description}
          onChange={(e) =>
            setSettings({ ...settings, description: e.target.value })
          }
          placeholder="What is this farm for?"
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Hub creation policy</label>
        {(
          [
            ["open", "Open — anyone can create"],
            ["admin_only", "Admin only"],
            ["disabled", "Disabled"],
          ] as [FarmCreationPolicy, string][]
        ).map(([value, label]) => (
          <label key={value} className="checkbox-label" style={{ display: "block", marginBottom: 4 }}>
            <input
              type="radio"
              name="creation_policy"
              checked={settings.creation_policy === value}
              onChange={() =>
                setSettings({ ...settings, creation_policy: value })
              }
            />
            {" "}{label}
          </label>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">Max hubs per user</label>
        <p className="muted">0 = unlimited</p>
        <input
          type="number"
          min={0}
          value={settings.max_hubs_per_user}
          onChange={(e) =>
            setSettings({
              ...settings,
              max_hubs_per_user: Number(e.target.value),
            })
          }
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Max hubs total</label>
        <p className="muted">0 = unlimited</p>
        <input
          type="number"
          min={0}
          value={settings.max_hubs_total}
          onChange={(e) =>
            setSettings({
              ...settings,
              max_hubs_total: Number(e.target.value),
            })
          }
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Directory</label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.directory_public}
            onChange={(e) =>
              setSettings({ ...settings, directory_public: e.target.checked })
            }
          />
          Directory public (list public hubs at /farm/hubs without auth)
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.allow_discovery_listing}
            onChange={(e) =>
              setSettings({
                ...settings,
                allow_discovery_listing: e.target.checked,
              })
            }
          />
          Allow discovery listing (publish to the Voxply discovery network)
        </label>
      </div>

      <div className="settings-section">
        <label className="settings-label">Languages</label>
        <p className="muted">
          BCP-47 codes, comma-separated (e.g. en, it, de). 1–5 values.
        </p>
        <input
          type="text"
          value={languageInput}
          onChange={(e) => setLanguageInput(e.target.value)}
          placeholder="en, it"
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Tags</label>
        {TAGS.map((tag) => (
          <label key={tag} className="checkbox-label" style={{ display: "inline-flex", marginRight: 12 }}>
            <input
              type="checkbox"
              checked={settings.tags.includes(tag)}
              onChange={() => toggleTag(tag)}
            />
            {" "}{tag}
          </label>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">Country</label>
        <p className="muted">ISO 3166-1 alpha-2 (e.g. IT, US, DE)</p>
        <input
          type="text"
          value={settings.country}
          onChange={(e) =>
            setSettings({ ...settings, country: e.target.value })
          }
          placeholder="IT"
          maxLength={2}
          style={{ width: 80 }}
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">Region</label>
        <p className="muted">
          EU-West, EU-East, US-East, US-West, APAC, LATAM, MEA
        </p>
        <input
          type="text"
          value={settings.region}
          onChange={(e) =>
            setSettings({ ...settings, region: e.target.value })
          }
          placeholder="EU-West"
        />
      </div>

      <div className="settings-section">
        {saveStatus === "ok" && (
          <p className="muted" style={{ color: "var(--success)", marginBottom: 8 }}>
            Settings saved.
          </p>
        )}
        {saveStatus === "error" && (
          <p className="error-text" style={{ marginBottom: 8 }}>{saveError}</p>
        )}
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

function HubsTab({ farmUrl }: { farmUrl: string }) {
  const [hubs, setHubs] = useState<FarmHubEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendTarget, setSuspendTarget] = useState<FarmHubEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FarmHubEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ hubs: FarmHubEntry[] }>("get_farm_hubs_admin", { farmUrl })
      .then((r) => { setHubs(r.hubs); setLoading(false); })
      .catch(() => setLoading(false));
  }, [farmUrl]);

  async function handleSuspend(hub: FarmHubEntry, reason: string) {
    setSuspendTarget(null);
    setActionError(null);
    try {
      await invoke("suspend_farm_hub", {
        farmUrl,
        hubId: hub.id,
        suspended: hub.suspended_at === null,
        reason: reason || null,
      });
      setHubs((prev) =>
        prev.map((h) =>
          h.id === hub.id
            ? {
                ...h,
                suspended_at:
                  h.suspended_at === null ? Math.floor(Date.now() / 1000) : null,
              }
            : h,
        ),
      );
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleDelete(hub: FarmHubEntry) {
    setDeleteTarget(null);
    setActionError(null);
    try {
      await invoke("delete_farm_hub", { farmUrl, hubId: hub.id });
      setHubs((prev) => prev.filter((h) => h.id !== hub.id));
    } catch (e) {
      setActionError(String(e));
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <h1>Hubs — {hubs.length}</h1>
      {actionError && <p className="error-text">{actionError}</p>}
      {hubs.length === 0 ? (
        <p className="muted">No hubs yet.</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Visibility</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hubs.map((hub) => (
              <tr key={hub.id}>
                <td>
                  <strong>{hub.name}</strong>
                  {hub.description && (
                    <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                      {hub.description}
                    </div>
                  )}
                </td>
                <td>
                  <span className="member-pk" title={hub.owner_pubkey}>
                    {hub.owner_display ?? formatPubkey(hub.owner_pubkey)}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${hub.visibility === "public" ? "badge-green" : "badge-muted"}`}
                  >
                    {hub.visibility}
                  </span>
                </td>
                <td>{formatRelative(hub.created_at)}</td>
                <td>
                  {hub.suspended_at ? (
                    <span className="badge badge-danger">suspended</span>
                  ) : (
                    <span className="badge badge-green">active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => setSuspendTarget(hub)}
                    >
                      {hub.suspended_at ? "Unsuspend" : "Suspend"}
                    </button>
                    <button
                      className="btn-small"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setDeleteTarget(hub)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {suspendTarget && !suspendTarget.suspended_at && (
        <SuspendDialog
          hubId={suspendTarget.id}
          hubName={suspendTarget.name}
          onConfirm={(reason) => handleSuspend(suspendTarget, reason)}
          onCancel={() => setSuspendTarget(null)}
        />
      )}
      {suspendTarget && suspendTarget.suspended_at && (
        <DeleteHubDialog
          hubName={suspendTarget.name}
          onConfirm={() => handleSuspend(suspendTarget, "")}
          onCancel={() => setSuspendTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteHubDialog
          hubName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}

function UsersTab({ farmUrl }: { farmUrl: string }) {
  const [users, setUsers] = useState<FarmUserEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchPage(p: number) {
    setLoading(true);
    setActionError(null);
    try {
      const result = await invoke<{
        users: FarmUserEntry[];
        total: number;
        page: number;
        limit: number;
      }>("get_farm_users", { farmUrl, page: p, limit: 50 });
      if (p === 1) {
        setUsers(result.users);
      } else {
        setUsers((prev) => [...prev, ...result.users]);
      }
      setTotal(result.total);
      setHasMore(p * result.limit < result.total);
      setPage(p);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPage(1); }, [farmUrl]);

  async function handleRevokeSessions(pubkey: string) {
    setActionError(null);
    try {
      await invoke("revoke_farm_user_sessions", { farmUrl, pubkey });
      setUsers((prev) =>
        prev.map((u) =>
          u.public_key === pubkey ? { ...u, active_sessions: 0 } : u,
        ),
      );
    } catch (e) {
      setActionError(String(e));
    }
  }

  return (
    <section>
      <h1>Users — {total}</h1>
      {actionError && <p className="error-text">{actionError}</p>}
      {users.length === 0 && !loading ? (
        <p className="muted">No users yet.</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>Pubkey</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Hubs owned</th>
              <th>Sessions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.public_key}>
                <td>
                  <span className="member-pk" title={u.public_key}>
                    {formatPubkey(u.public_key)}
                  </span>
                </td>
                <td>{formatRelative(u.first_seen_at)}</td>
                <td>{formatRelative(u.last_seen_at)}</td>
                <td>{u.hubs_owned}</td>
                <td>{u.active_sessions}</td>
                <td>
                  <button
                    className="btn-small btn-secondary"
                    disabled={u.active_sessions === 0}
                    onClick={() => handleRevokeSessions(u.public_key)}
                  >
                    Revoke sessions
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {loading && <p className="muted">Loading…</p>}
      {hasMore && !loading && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-secondary" onClick={() => fetchPage(page + 1)}>
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

export function FarmSettingsPage({ farmUrl, tab, onTab, onClose }: Props) {
  const tabs: { id: FarmAdminTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "hubs", label: "Hubs" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Farm settings</h2>
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                className={`settings-nav-item ${tab === t.id ? "active" : ""}`}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={onClose}>
          Close (ESC)
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={onClose} title="Close">
          ×
        </button>
        {tab === "general" && <GeneralTab farmUrl={farmUrl} />}
        {tab === "hubs" && <HubsTab farmUrl={farmUrl} />}
        {tab === "users" && <UsersTab farmUrl={farmUrl} />}
      </main>
    </div>
  );
}
