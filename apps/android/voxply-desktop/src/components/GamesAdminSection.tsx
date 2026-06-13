import React, { useEffect, useState } from "react";
import type { AdminGame, InstalledGame } from "../types";

interface Props {
  hubUrl: string;
  channels: { id: string; name: string }[];
}

export function GamesAdminSection({ hubUrl, channels }: Props) {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [installName, setInstallName] = useState("");
  const [installUrl, setInstallUrl] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "ok" | "error">("idle");
  const [installError, setInstallError] = useState("");

  const [editingPerms, setEditingPerms] = useState<string | null>(null);
  const [permsState, setPermsState] = useState<Record<string, string[]>>({});
  const [editingScope, setEditingScope] = useState<string | null>(null);
  const [scopeState, setScopeState] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchGames();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl]);

  async function fetchGames() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${hubUrl}/admin/games`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { games: AdminGame[] } = await res.json();
      setGames(data.games ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function quickInstall(e: React.FormEvent) {
    e.preventDefault();
    if (!installName.trim() || !installUrl.trim()) return;
    setInstallStatus("installing");
    setInstallError("");
    try {
      const res = await fetch(`${hubUrl}/admin/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: installName.trim(), entry_url: installUrl.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInstallName("");
      setInstallUrl("");
      setInstallStatus("ok");
      setTimeout(() => setInstallStatus("idle"), 2000);
      await fetchGames();
    } catch (e) {
      setInstallError(String(e));
      setInstallStatus("error");
    }
  }

  async function installByManifest(e: React.FormEvent) {
    e.preventDefault();
    if (!manifestUrl.trim()) return;
    setInstallStatus("installing");
    setInstallError("");
    try {
      const res = await fetch(`${hubUrl}/admin/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest_url: manifestUrl.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setManifestUrl("");
      setInstallStatus("ok");
      setTimeout(() => setInstallStatus("idle"), 2000);
      await fetchGames();
    } catch (e) {
      setInstallError(String(e));
      setInstallStatus("error");
    }
  }

  async function uninstall(gameId: string) {
    try {
      await fetch(`${hubUrl}/admin/games/${gameId}`, { method: "DELETE" });
      await fetchGames();
    } catch (e) {
      setError(String(e));
    }
  }

  async function savePerms(gameId: string) {
    const perms = permsState[gameId] ?? [];
    try {
      await fetch(`${hubUrl}/admin/games/${gameId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: perms }),
      });
      setEditingPerms(null);
      await fetchGames();
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveScope(gameId: string) {
    const scope = scopeState[gameId] ?? [];
    try {
      await fetch(`${hubUrl}/admin/games/${gameId}/channels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_ids: scope }),
      });
      setEditingScope(null);
      await fetchGames();
    } catch (e) {
      setError(String(e));
    }
  }

  const CAPS = ["post_message", "read_channel_history", "list_channel_users"];

  return (
    <div className="games-admin-section">
      <h1>Games</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="settings-section">
        <label className="settings-label">Quick install</label>
        <form onSubmit={quickInstall}>
          <input
            type="text"
            value={installName}
            onChange={(e) => setInstallName(e.target.value)}
            placeholder="Game name"
            style={{ marginBottom: 6 }}
          />
          <input
            type="text"
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            placeholder="Game URL (entry_url)"
          />
          {installError && <p className="error-text">{installError}</p>}
          <button
            type="submit"
            className="btn-primary"
            disabled={installStatus === "installing"}
            style={{ marginTop: 8 }}
          >
            {installStatus === "installing" ? "Installing…" : installStatus === "ok" ? "Installed!" : "Install"}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <label className="settings-label">Install by manifest URL</label>
        <form onSubmit={installByManifest}>
          <input
            type="text"
            value={manifestUrl}
            onChange={(e) => setManifestUrl(e.target.value)}
            placeholder="https://example.com/game/manifest.json"
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={installStatus === "installing"}
            style={{ marginTop: 8 }}
          >
            {installStatus === "installing" ? "Installing…" : "Install from manifest"}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <label className="settings-label">Installed games</label>
        {loading && <p className="muted">Loading…</p>}
        {!loading && games.length === 0 && <p className="muted">No games installed.</p>}
        {games.map((g) => (
          <div key={g.id} className="game-admin-row settings-row">
            <div className="game-admin-info">
              {g.thumbnail_url && <img src={g.thumbnail_url} alt="" className="game-admin-thumb" />}
              <div>
                <strong>{g.name}</strong>
                {g.description && <span className="muted"> — {g.description}</span>}
              </div>
            </div>

            <div className="game-admin-actions">
              <button
                className="btn-secondary btn-small"
                onClick={() => {
                  setEditingPerms(editingPerms === g.id ? null : g.id);
                  setPermsState((s) => ({ ...s, [g.id]: [...g.capabilities] }));
                }}
              >
                Permissions
              </button>
              <button
                className="btn-secondary btn-small"
                onClick={() => {
                  setEditingScope(editingScope === g.id ? null : g.id);
                  setScopeState((s) => ({ ...s, [g.id]: [...g.channel_scope] }));
                }}
              >
                Channels
              </button>
              <button className="btn-danger btn-small" onClick={() => uninstall(g.id)}>Uninstall</button>
            </div>

            {editingPerms === g.id && (
              <div className="game-admin-perms">
                {CAPS.map((cap) => {
                  const checked = (permsState[g.id] ?? []).includes(cap);
                  return (
                    <label key={cap} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setPermsState((s) => {
                            const prev = s[g.id] ?? [];
                            const next = e.target.checked
                              ? [...prev, cap]
                              : prev.filter((c) => c !== cap);
                            return { ...s, [g.id]: next };
                          });
                        }}
                      />
                      {cap}
                    </label>
                  );
                })}
                <button className="btn-primary btn-small" onClick={() => savePerms(g.id)}>Save permissions</button>
              </div>
            )}

            {editingScope === g.id && (
              <div className="game-admin-scope">
                <p className="muted">Leave all unchecked to allow in all channels.</p>
                {channels.map((ch) => {
                  const checked = (scopeState[g.id] ?? []).includes(ch.id);
                  return (
                    <label key={ch.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setScopeState((s) => {
                            const prev = s[g.id] ?? [];
                            const next = e.target.checked
                              ? [...prev, ch.id]
                              : prev.filter((c) => c !== ch.id);
                            return { ...s, [g.id]: next };
                          });
                        }}
                      />
                      #{ch.name}
                    </label>
                  );
                })}
                <button className="btn-primary btn-small" onClick={() => saveScope(g.id)}>Save channel scope</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
