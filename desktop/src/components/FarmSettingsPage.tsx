import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type {
  FarmSettings,
  FarmHubEntry,
  FarmUserEntry,
  FarmCreationPolicy,
} from "../types";
import { formatPubkey, formatRelative } from "../utils/format";
import { FocusTrap } from "./FocusTrap";

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

function GeneralTab({ farmUrl }: { farmUrl: string }) {
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

function HubsTab({ farmUrl }: { farmUrl: string }) {
  const { t } = useTranslation();
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
                    onClick={() => handleRevokeSessions(u.public_key)}
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
          <button className="btn-secondary" onClick={() => fetchPage(page + 1)}>
            {t("discover.load_more")}
          </button>
        </div>
      )}
    </section>
  );
}

export function FarmSettingsPage({ farmUrl, tab, onTab, onClose }: Props) {
  const { t } = useTranslation();

  const tabs: { id: FarmAdminTab; label: string }[] = [
    { id: "general", label: t("farm.settings.tabs.general") },
    { id: "hubs", label: t("farm.settings.tabs.hubs") },
    { id: "users", label: t("farm.settings.tabs.users") },
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
        {tab === "general" && <GeneralTab farmUrl={farmUrl} />}
        {tab === "hubs" && <HubsTab farmUrl={farmUrl} />}
        {tab === "users" && <UsersTab farmUrl={farmUrl} />}
      </main>
    </div>
    </FocusTrap>
  );
}
