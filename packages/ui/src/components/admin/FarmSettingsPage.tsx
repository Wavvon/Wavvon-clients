import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { FocusTrap } from "../FocusTrap";
import type {
  FarmSettings,
  FarmHubEntry,
  FarmUserEntry,
  FarmServerEntry,
  FarmCreationPolicy,
} from "../../types";

export type FarmAdminTab = "general" | "hubs" | "users" | "servers" | "security";

export interface FarmSettingsActions {
  getSettings: (farmUrl: string) => Promise<FarmSettings>;
  patchSettings: (farmUrl: string, settings: Partial<FarmSettings>) => Promise<FarmSettings>;
  getHubs: (farmUrl: string) => Promise<{ hubs: FarmHubEntry[] }>;
  suspendHub: (farmUrl: string, hubId: string, suspended: boolean, reason: string | null) => Promise<void>;
  deleteHub: (farmUrl: string, hubId: string) => Promise<void>;
  getUsers: (farmUrl: string, page: number, limit: number) => Promise<{ users: FarmUserEntry[]; total: number; page: number; limit: number }>;
  revokeUserSessions: (farmUrl: string, pubkey: string) => Promise<void>;
  getServers: (farmUrl: string) => Promise<{ servers: FarmServerEntry[] }>;
  generateServerToken: (farmUrl: string, name: string, region: string | null) => Promise<{ server_id: string; token: string }>;
  totpSetup: (farmUrl: string) => Promise<{ secret: string; qr_url: string }>;
  totpConfirm: (farmUrl: string, secret: string, code: string) => Promise<void>;
  totpDisable: (farmUrl: string, code: string) => Promise<void>;
}

interface Props {
  farmUrl: string;
  tab: FarmAdminTab;
  onTab: (t: FarmAdminTab) => void;
  onClose: () => void;
  actions: FarmSettingsActions;
}

const TAGS = ["gaming", "professional", "creative", "education", "community", "18plus"] as const;

function SuspendDialog({
  hubName,
  onConfirm,
  onCancel,
}: {
  hubName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="suspend-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="suspend-dialog-title">{t("farm.suspend_dialog.title")}</h3>
        <p className="muted" dangerouslySetInnerHTML={{ __html: t("farm.suspend_dialog.hint", { name: hubName }) }} />
        <label className="settings-label" htmlFor="suspend-reason">{t("farm.suspend_dialog.reason")}</label>
        <input
          id="suspend-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("farm.suspend_dialog.reason_placeholder")}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {t("modal.cancel")}
          </button>
          <button
            style={{ background: "var(--danger)", color: "#fff" }}
            onClick={() => onConfirm(reason)}
          >
            {t("farm.suspend_dialog.confirm")}
          </button>
        </div>
      </div>
      </FocusTrap>
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
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-hub-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="delete-hub-title">{t("farm.delete_dialog.title")}</h3>
        <p className="muted" dangerouslySetInnerHTML={{ __html: t("farm.delete_dialog.hint", { name: hubName }) }} />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {t("modal.cancel")}
          </button>
          <button
            style={{ background: "var(--danger)", color: "#fff" }}
            onClick={onConfirm}
          >
            {t("farm.delete_dialog.confirm")}
          </button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}

function GeneralTab({ farmUrl, actions }: { farmUrl: string; actions: FarmSettingsActions }) {
  const { t } = useTranslation();
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
    actions.getSettings(farmUrl)
      .then((s) => {
        setSettings(s);
        setLanguageInput(s.languages.join(", "));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const updated = await actions.patchSettings(farmUrl, payload);
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
        tags: has ? prev.tags.filter((tg) => tg !== tag) : [...prev.tags, tag],
      };
    });
  }

  if (loading) return <p className="muted">{t("bot.card.loading")}</p>;

  const policyOptions: [FarmCreationPolicy, string][] = [
    ["open", t("farm.settings.general.policy.open")],
    ["admin_only", t("farm.settings.general.policy.admin_only")],
    ["disabled", t("farm.settings.general.policy.disabled")],
  ];

  return (
    <section>
      <h1>{t("farm.settings.tabs.general")}</h1>

      <div className="settings-section">
        <label className="settings-label" htmlFor="farm-name">{t("farm.settings.general.name")}</label>
        <input
          id="farm-name"
          type="text"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          placeholder="My Farm"
        />
      </div>

      <div className="settings-section">
        <label className="settings-label" htmlFor="farm-description">{t("farm.settings.general.description")}</label>
        <textarea
          id="farm-description"
          rows={3}
          value={settings.description}
          onChange={(e) =>
            setSettings({ ...settings, description: e.target.value })
          }
          placeholder="What is this farm for?"
        />
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("farm.settings.general.policy.label")}</label>
        {policyOptions.map(([value, label]) => (
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
        <label className="settings-label" htmlFor="farm-max-per-user">{t("farm.settings.general.max_per_user")}</label>
        <p className="muted">{t("farm.settings.general.unlimited")}</p>
        <input
          id="farm-max-per-user"
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
        <label className="settings-label" htmlFor="farm-max-total">{t("farm.settings.general.max_total")}</label>
        <p className="muted">{t("farm.settings.general.unlimited")}</p>
        <input
          id="farm-max-total"
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
        <label className="settings-label">{t("farm.settings.general.directory.label")}</label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.directory_public}
            onChange={(e) =>
              setSettings({ ...settings, directory_public: e.target.checked })
            }
          />
          {" "}{t("farm.settings.general.directory.public")}
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
          {" "}{t("farm.settings.general.directory.discovery")}
        </label>
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("farm.settings.general.languages")}</label>
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
        <label className="settings-label">{t("farm.settings.general.tags")}</label>
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
        <label className="settings-label">{t("farm.settings.general.country")}</label>
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
        <label className="settings-label">{t("farm.settings.general.region")}</label>
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
            {t("farm.settings.general.saved")}
          </p>
        )}
        {saveStatus === "error" && (
          <p className="error-text" style={{ marginBottom: 8 }}>{saveError}</p>
        )}
        <button onClick={handleSave} disabled={saving}>
          {saving ? t("farm.settings.general.saving") : t("farm.settings.general.save")}
        </button>
      </div>
    </section>
  );
}

function HubsTab({ farmUrl, actions }: { farmUrl: string; actions: FarmSettingsActions }) {
  const { t } = useTranslation();
  const [hubs, setHubs] = useState<FarmHubEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendTarget, setSuspendTarget] = useState<FarmHubEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FarmHubEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    actions.getHubs(farmUrl)
      .then((r) => { setHubs(r.hubs); setLoading(false); })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmUrl]);

  async function handleSuspend(hub: FarmHubEntry, reason: string) {
    setSuspendTarget(null);
    setActionError(null);
    try {
      await actions.suspendHub(farmUrl, hub.id, hub.suspended_at === null, reason || null);
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
      await actions.deleteHub(farmUrl, hub.id);
      setHubs((prev) => prev.filter((h) => h.id !== hub.id));
    } catch (e) {
      setActionError(String(e));
    }
  }

  if (loading) return <p className="muted">{t("bot.card.loading")}</p>;

  return (
    <section>
      <h1>{t("farm.settings.hubs.title", { count: hubs.length })}</h1>
      {actionError && <p className="error-text">{actionError}</p>}
      {hubs.length === 0 ? (
        <p className="muted">{t("farm.settings.hubs.empty")}</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>{t("farm.settings.hubs.col.name")}</th>
              <th>{t("farm.settings.hubs.col.owner")}</th>
              <th>{t("farm.settings.hubs.col.visibility")}</th>
              <th>{t("farm.settings.hubs.col.created")}</th>
              <th>{t("farm.settings.hubs.col.status")}</th>
              <th>{t("farm.settings.hubs.col.actions")}</th>
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
                    <span className="badge badge-danger">{t("farm.settings.hubs.status.suspended")}</span>
                  ) : (
                    <span className="badge badge-green">{t("farm.settings.hubs.status.active")}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => setSuspendTarget(hub)}
                    >
                      {hub.suspended_at ? t("farm.settings.hubs.unsuspend") : t("farm.settings.hubs.suspend")}
                    </button>
                    <button
                      className="btn-small"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setDeleteTarget(hub)}
                    >
                      {t("farm.settings.hubs.delete")}
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

function UsersTab({ farmUrl, actions }: { farmUrl: string; actions: FarmSettingsActions }) {
  const { t } = useTranslation();
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
      const result = await actions.getUsers(farmUrl, p, 50);
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

  useEffect(() => { void fetchPage(1); }, [farmUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRevokeSessions(pubkey: string) {
    setActionError(null);
    try {
      await actions.revokeUserSessions(farmUrl, pubkey);
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
      <h1>{t("farm.settings.users.title", { count: total })}</h1>
      {actionError && <p className="error-text">{actionError}</p>}
      {users.length === 0 && !loading ? (
        <p className="muted">{t("farm.settings.users.empty")}</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>{t("farm.settings.users.col.pubkey")}</th>
              <th>{t("farm.settings.users.col.first_seen")}</th>
              <th>{t("farm.settings.users.col.last_seen")}</th>
              <th>{t("farm.settings.users.col.hubs_owned")}</th>
              <th>{t("farm.settings.users.col.sessions")}</th>
              <th>{t("farm.settings.users.col.actions")}</th>
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
                    onClick={() => void handleRevokeSessions(u.public_key)}
                  >
                    {t("farm.settings.users.revoke_sessions")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {loading && <p className="muted">{t("bot.card.loading")}</p>}
      {hasMore && !loading && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-secondary" onClick={() => void fetchPage(page + 1)}>
            {t("discover.load_more")}
          </button>
        </div>
      )}
    </section>
  );
}

function ServersTab({ farmUrl, actions }: { farmUrl: string; actions: FarmSettingsActions }) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<FarmServerEntry[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerRegion, setNewServerRegion] = useState("");
  const [generatedToken, setGeneratedToken] = useState<{ server_id: string; token: string } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  async function loadServers() {
    setLoadingServers(true);
    try {
      const result = await actions.getServers(farmUrl);
      setServers(result.servers);
    } catch {
      // silently keep previous list on error
    } finally {
      setLoadingServers(false);
    }
  }

  useEffect(() => { void loadServers(); }, [farmUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerateToken() {
    if (!newServerName.trim()) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const result = await actions.generateServerToken(farmUrl, newServerName.trim(), newServerRegion.trim() || null);
      setGeneratedToken(result);
      setNewServerName("");
      setNewServerRegion("");
      setShowRegisterForm(false);
      await loadServers();
    } catch (e) {
      setRegisterError(String(e));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <section>
      <h1>{t("farm.settings.tabs.servers")}</h1>

      {loadingServers ? (
        <p className="muted">{t("bot.card.loading")}</p>
      ) : servers.length === 0 ? (
        <p className="muted">{t("farm.settings.servers.empty")}</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>{t("farm.settings.servers.col.name")}</th>
              <th>{t("farm.settings.servers.col.region")}</th>
              <th>{t("farm.settings.servers.col.status")}</th>
              <th>{t("farm.settings.servers.col.last_seen")}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((srv) => (
              <tr key={srv.id}>
                <td><strong>{srv.name}</strong></td>
                <td>{srv.region ?? <span className="muted">—</span>}</td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: srv.connected ? "var(--success)" : "var(--border)",
                      flexShrink: 0,
                    }} />
                    {srv.connected
                      ? t("farm.settings.servers.status.connected")
                      : t("farm.settings.servers.status.offline")}
                  </span>
                </td>
                <td>
                  {srv.last_seen_at ? formatRelative(srv.last_seen_at) : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {generatedToken && (
        <div className="settings-section" style={{ marginTop: 16, background: "var(--bg-elevated)", borderRadius: 8, padding: 16, border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--warning, var(--accent))", fontWeight: 600, marginBottom: 8 }}>
            {t("farm.settings.servers.token_once")}
          </p>
          <code style={{
            display: "block",
            padding: "8px 12px",
            background: "var(--bg-base, var(--bg))",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: "var(--text-sm)",
            wordBreak: "break-all",
            userSelect: "all",
            border: "1px solid var(--border)",
          }}>
            {generatedToken.token}
          </code>
          <button
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => navigator.clipboard.writeText(generatedToken.token)}
          >
            {t("farm.settings.servers.copy_token")}
          </button>
          <button
            className="btn-secondary"
            style={{ marginTop: 8, marginLeft: 8 }}
            onClick={() => setGeneratedToken(null)}
          >
            {t("modal.close")}
          </button>
        </div>
      )}

      <div className="settings-section" style={{ marginTop: 16 }}>
        {!showRegisterForm ? (
          <button onClick={() => { setShowRegisterForm(true); setRegisterError(null); }}>
            {t("farm.settings.servers.register")}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
            <label className="settings-label" htmlFor="new-server-name">
              {t("farm.settings.servers.name_label")}
            </label>
            <input
              id="new-server-name"
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder={t("farm.settings.servers.name_placeholder")}
              autoFocus
            />
            <label className="settings-label" htmlFor="new-server-region">
              {t("farm.settings.servers.region_label")}
            </label>
            <input
              id="new-server-region"
              type="text"
              value={newServerRegion}
              onChange={(e) => setNewServerRegion(e.target.value)}
              placeholder={t("farm.settings.servers.region_placeholder")}
            />
            {registerError && <p className="error-text">{registerError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleGenerateToken} disabled={registering || !newServerName.trim()}>
                {registering ? t("farm.settings.servers.generating") : t("farm.settings.servers.generate_token")}
              </button>
              <button className="btn-secondary" onClick={() => { setShowRegisterForm(false); setRegisterError(null); }}>
                {t("modal.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SecurityTab({ farmUrl, actions }: { farmUrl: string; actions: FarmSettingsActions }) {
  const { t } = useTranslation();
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qr_url: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSetup() {
    setBusy(true);
    setTotpError(null);
    try {
      const result = await actions.totpSetup(farmUrl);
      setSetupData(result);
    } catch (e) {
      setTotpError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!setupData || !confirmCode.trim()) return;
    setBusy(true);
    setTotpError(null);
    try {
      await actions.totpConfirm(farmUrl, setupData.secret, confirmCode.trim());
      setTotpEnabled(true);
      setSetupData(null);
      setConfirmCode("");
    } catch (e) {
      setTotpError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!disableCode.trim()) return;
    setBusy(true);
    setTotpError(null);
    try {
      await actions.totpDisable(farmUrl, disableCode.trim());
      setTotpEnabled(false);
      setDisableCode("");
    } catch (e) {
      setTotpError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>{t("farm.settings.tabs.security")}</h1>

      <div className="settings-section">
        <label className="settings-label">{t("farm.settings.security.totp.label")}</label>

        {totpEnabled ? (
          <>
            <p>
              <span className="badge badge-green">{t("farm.settings.security.totp.enabled_badge")}</span>
            </p>
            <p className="muted" style={{ marginTop: 8 }}>{t("farm.settings.security.totp.disable_hint")}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder={t("farm.settings.security.totp.code_placeholder")}
              style={{ width: 140, marginTop: 8, fontFamily: "monospace" }}
            />
            {totpError && <p className="error-text" style={{ marginTop: 6 }}>{totpError}</p>}
            <div style={{ marginTop: 8 }}>
              <button
                style={{ background: "var(--danger)", color: "#fff" }}
                onClick={handleDisable}
                disabled={busy || !disableCode.trim()}
              >
                {busy ? t("farm.settings.security.totp.disabling") : t("farm.settings.security.totp.disable")}
              </button>
            </div>
          </>
        ) : (
          <>
            {!setupData ? (
              <>
                <p className="muted">{t("farm.settings.security.totp.disabled_hint")}</p>
                {totpError && <p className="error-text" style={{ marginTop: 6 }}>{totpError}</p>}
                <div style={{ marginTop: 8 }}>
                  <button onClick={handleSetup} disabled={busy}>
                    {busy ? t("farm.settings.security.totp.setting_up") : t("farm.settings.security.totp.enable")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 8 }}>{t("farm.settings.security.totp.scan_hint")}</p>
                <div style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 12,
                  fontFamily: "monospace",
                  fontSize: "var(--text-sm)",
                  wordBreak: "break-all",
                  userSelect: "all",
                }}>
                  {setupData.secret}
                </div>
                <label className="settings-label" htmlFor="totp-confirm-code">
                  {t("farm.settings.security.totp.confirm_code_label")}
                </label>
                <input
                  id="totp-confirm-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder={t("farm.settings.security.totp.code_placeholder")}
                  style={{ width: 140, marginTop: 6, fontFamily: "monospace" }}
                  autoFocus
                />
                {totpError && <p className="error-text" style={{ marginTop: 6 }}>{totpError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={handleConfirm} disabled={busy || !confirmCode.trim()}>
                    {busy ? t("farm.settings.security.totp.confirming") : t("farm.settings.security.totp.confirm_enable")}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => { setSetupData(null); setConfirmCode(""); setTotpError(null); }}
                  >
                    {t("modal.cancel")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function FarmSettingsPage({ farmUrl, tab, onTab, onClose, actions }: Props) {
  const { t } = useTranslation();

  const tabs: { id: FarmAdminTab; label: string }[] = [
    { id: "general", label: t("farm.settings.tabs.general") },
    { id: "hubs", label: t("farm.settings.tabs.hubs") },
    { id: "users", label: t("farm.settings.tabs.users") },
    { id: "servers", label: t("farm.settings.tabs.servers") },
    { id: "security", label: t("farm.settings.tabs.security") },
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FocusTrap>
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>{t("farm.settings.title")}</h2>
        <ul>
          {tabs.map((tab_item) => (
            <li key={tab_item.id}>
              <button
                className={`settings-nav-item ${tab === tab_item.id ? "active" : ""}`}
                onClick={() => onTab(tab_item.id)}
              >
                {tab_item.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={onClose}>
          {t("settings.close")}
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={onClose} title={t("modal.close")}>
          ×
        </button>
        {tab === "general" && <GeneralTab farmUrl={farmUrl} actions={actions} />}
        {tab === "hubs" && <HubsTab farmUrl={farmUrl} actions={actions} />}
        {tab === "users" && <UsersTab farmUrl={farmUrl} actions={actions} />}
        {tab === "servers" && <ServersTab farmUrl={farmUrl} actions={actions} />}
        {tab === "security" && <SecurityTab farmUrl={farmUrl} actions={actions} />}
      </main>
    </div>
    </FocusTrap>
  );
}
