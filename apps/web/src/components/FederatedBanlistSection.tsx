import { useEffect, useState } from "react";
import type { BanlistSource, FederatedBanEntry, BanlistOverride } from "../types";
import {
  getBanlistSettings,
  getBanlistEntries,
  getBanlistOverrides,
  addBanlistSource,
  removeBanlistSource,
  updateBanlistSourcePolicy,
  addBanlistOverride,
  removeBanlistOverride,
  setBanlistPublish,
} from "../platform/commands/moderation";
import { formatRelative } from "@wavvon/core";

export function FederatedBanlistSection() {
  const [sources, setSources] = useState<BanlistSource[]>([]);
  const [entries, setEntries] = useState<FederatedBanEntry[]>([]);
  const [overrides, setOverrides] = useState<BanlistOverride[]>([]);
  const [publishBanlist, setPublishBanlist] = useState(false);
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourcePolicy, setNewSourcePolicy] = useState<"hard-reject" | "soft-flag">("hard-reject");

  const [newOverridePubkey, setNewOverridePubkey] = useState("");
  const [newOverrideType, setNewOverrideType] = useState<"whitelist" | "blacklist">("whitelist");
  const [newOverrideReason, setNewOverrideReason] = useState("");

  async function load() {
    setError(null);
    try {
      const [settingsData, entriesData, overridesData] = await Promise.all([
        getBanlistSettings(),
        getBanlistEntries(),
        getBanlistOverrides(),
      ]);
      setSources(settingsData.sources);
      setPublishBanlist(settingsData.publish_banlist);
      setEntries(entriesData);
      setOverrides(overridesData);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAddSource() {
    if (!newSourceUrl.trim()) return;
    try {
      await addBanlistSource(newSourceUrl.trim(), newSourcePolicy);
      setNewSourceUrl("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveSource(url: string) {
    try {
      await removeBanlistSource(url);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePolicyChange(url: string, policy: "hard-reject" | "soft-flag") {
    try {
      await updateBanlistSourcePolicy(url, policy);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePublishToggle(checked: boolean) {
    try {
      await setBanlistPublish(checked);
      setPublishBanlist(checked);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAddOverride() {
    if (!newOverridePubkey.trim()) return;
    try {
      await addBanlistOverride(
        newOverridePubkey.trim(),
        newOverrideType,
        newOverrideReason.trim() || undefined,
      );
      setNewOverridePubkey("");
      setNewOverrideReason("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveOverride(pubkey: string) {
    try {
      await removeBanlistOverride(pubkey);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="settings-section">
      <h2>Federated Ban Lists</h2>
      {error && <p className="error-text">{error}</p>}

      <h3>Sources</h3>
      {sources.length === 0 && <p className="muted">No sources configured.</p>}
      {sources.length > 0 && (
        <table className="members-table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Policy</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.url}>
                <td style={{ wordBreak: "break-all" }}>{s.url}</td>
                <td>
                  <select
                    value={s.policy}
                    onChange={(e) =>
                      handlePolicyChange(s.url, e.target.value as "hard-reject" | "soft-flag")
                    }
                  >
                    <option value="hard-reject">Hard reject</option>
                    <option value="soft-flag">Soft flag</option>
                  </select>
                </td>
                <td>{formatRelative(s.added_at)}</td>
                <td>
                  <button
                    className="btn-small btn-secondary danger"
                    onClick={() => handleRemoveSource(s.url)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="settings-row" style={{ marginTop: "var(--space-3)" }}>
        <input
          type="url"
          placeholder="https://hub.example/federation/banlist"
          value={newSourceUrl}
          onChange={(e) => setNewSourceUrl(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          value={newSourcePolicy}
          onChange={(e) => setNewSourcePolicy(e.target.value as "hard-reject" | "soft-flag")}
        >
          <option value="hard-reject">Hard reject</option>
          <option value="soft-flag">Soft flag</option>
        </select>
        <button onClick={handleAddSource} disabled={!newSourceUrl.trim()}>
          Add source
        </button>
      </div>

      <div className="settings-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={publishBanlist}
            onChange={(e) => handlePublishToggle(e.target.checked)}
          />
          Publish this hub's own ban list at /federation/banlist
        </label>
      </div>

      <h3>
        <button
          className="btn-secondary"
          style={{ fontSize: "inherit", padding: "0 var(--space-1)" }}
          onClick={() => setEntriesOpen((o) => !o)}
          aria-expanded={entriesOpen}
        >
          {entriesOpen ? "▾" : "▸"} Synced entries ({entries.length})
        </button>
      </h3>
      {entriesOpen && (
        entries.length === 0 ? (
          <p className="muted">No synced entries.</p>
        ) : (
          <table className="members-table">
            <thead>
              <tr>
                <th>Source hub</th>
                <th>Target pubkey</th>
                <th>Reason</th>
                <th>Synced</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={idx}>
                  <td className="member-pk">{e.source_hub_pubkey.slice(0, 8)}</td>
                  <td className="member-pk">{e.target_master_pubkey.slice(0, 8)}</td>
                  <td>{e.reason ?? <span className="muted">—</span>}</td>
                  <td>{formatRelative(e.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      <h3>Local overrides</h3>
      {overrides.length === 0 && <p className="muted">No local overrides.</p>}
      {overrides.length > 0 && (
        <table className="members-table">
          <thead>
            <tr>
              <th>Pubkey</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.target_pubkey}>
                <td className="member-pk">{o.target_pubkey.slice(0, 8)}</td>
                <td>
                  <span className="badge-chip">
                    {o.override_type}
                  </span>
                </td>
                <td>{o.reason ?? <span className="muted">—</span>}</td>
                <td>
                  <button
                    className="btn-small btn-secondary danger"
                    onClick={() => handleRemoveOverride(o.target_pubkey)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="settings-row" style={{ marginTop: "var(--space-3)", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <input
          type="text"
          placeholder="Pubkey (hex)"
          value={newOverridePubkey}
          onChange={(e) => setNewOverridePubkey(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select
          value={newOverrideType}
          onChange={(e) => setNewOverrideType(e.target.value as "whitelist" | "blacklist")}
        >
          <option value="whitelist">Whitelist</option>
          <option value="blacklist">Blacklist</option>
        </select>
        <input
          type="text"
          placeholder="Reason (optional)"
          value={newOverrideReason}
          onChange={(e) => setNewOverrideReason(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <button onClick={handleAddOverride} disabled={!newOverridePubkey.trim()}>
          Add override
        </button>
      </div>
    </div>
  );
}
