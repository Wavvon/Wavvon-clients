import { useState, useEffect } from "react";
import type { InstalledGameAdmin, Channel } from "../types";
import {
  listGamesAdmin,
  installGame,
  installGameFromUrl,
  uninstallGame,
  setGameChannelScope,
  setGamePermissions,
} from "../platform/commands/hubAdmin";

const ALL_CAPABILITIES = ["post_message", "read_channel_history", "list_channel_users"];

interface Props {
  hubUrl: string;
  channels: Channel[];
}

export function GamesAdminSection({ hubUrl: _hubUrl, channels }: Props) {
  const [games, setGames] = useState<InstalledGameAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [installMode, setInstallMode] = useState<"quick" | "url" | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickUrl, setQuickUrl] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await listGamesAdmin();
      setGames(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickInstall() {
    if (!quickName.trim() || !quickUrl.trim()) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await installGame({ name: quickName.trim(), entry_url: quickUrl.trim() });
      setQuickName("");
      setQuickUrl("");
      setInstallMode(null);
      await load();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  async function handleManifestInstall() {
    if (!manifestUrl.trim()) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await installGameFromUrl(manifestUrl.trim());
      setManifestUrl("");
      setInstallMode(null);
      await load();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall(gameId: string) {
    if (!confirm("Uninstall this game?")) return;
    try {
      await uninstallGame(gameId);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleChannelScope(gameId: string, channelIds: string[]) {
    try {
      await setGameChannelScope(gameId, channelIds);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePermissions(gameId: string, perms: string[]) {
    try {
      await setGamePermissions(gameId, perms);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h1>Games</h1>
      <p className="muted">
        Install Tier 1 HTML5 games. Members launch them from the Activities button.
      </p>

      <div className="settings-section">
        <div className="settings-row">
          <button onClick={() => setInstallMode(installMode === "quick" ? null : "quick")}>
            + Quick install
          </button>
          <button className="btn-secondary" onClick={() => setInstallMode(installMode === "url" ? null : "url")}>
            + From manifest URL
          </button>
        </div>

        {installMode === "quick" && (
          <div className="games-install-form">
            <input
              type="text"
              placeholder="Game name"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              style={{ width: "100%" }}
            />
            <input
              type="text"
              placeholder="Entry URL (https://…)"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              style={{ width: "100%" }}
            />
            {installError && <p className="error-text">{installError}</p>}
            <div className="settings-row">
              <button onClick={handleQuickInstall} disabled={installing}>
                {installing ? "Installing…" : "Install"}
              </button>
              <button className="btn-secondary" onClick={() => { setInstallMode(null); setInstallError(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {installMode === "url" && (
          <div className="games-install-form">
            <input
              type="text"
              placeholder="Manifest URL (https://…/manifest.json)"
              value={manifestUrl}
              onChange={(e) => setManifestUrl(e.target.value)}
              style={{ width: "100%" }}
            />
            {installError && <p className="error-text">{installError}</p>}
            <div className="settings-row">
              <button onClick={handleManifestInstall} disabled={installing}>
                {installing ? "Installing…" : "Install"}
              </button>
              <button className="btn-secondary" onClick={() => { setInstallMode(null); setInstallError(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {games.length === 0 && !loading && (
        <p className="muted">No games installed.</p>
      )}

      {games.map((game) => {
        const expanded = expandedGameId === game.id;
        return (
          <div key={game.id} className="settings-section game-admin-row">
            <div className="settings-row">
              {game.thumbnail_url && (
                <img src={game.thumbnail_url} alt={game.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: "var(--r-sm)" }} />
              )}
              <div style={{ flex: 1 }}>
                <strong>{game.name}</strong>
                {game.version && <span className="muted" style={{ marginLeft: 8 }}>{game.version}</span>}
                {game.description && <p className="muted" style={{ margin: "2px 0 0" }}>{game.description}</p>}
              </div>
              <button className="btn-secondary" onClick={() => setExpandedGameId(expanded ? null : game.id)}>
                {expanded ? "Collapse" : "Configure"}
              </button>
              <button className="btn-secondary danger" onClick={() => handleUninstall(game.id)}>
                Uninstall
              </button>
            </div>

            {expanded && (
              <GameConfigPanel
                game={game}
                channels={channels}
                onSaveScope={(ids) => handleChannelScope(game.id, ids)}
                onSavePerms={(perms) => handlePermissions(game.id, perms)}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

interface GameConfigProps {
  game: InstalledGameAdmin;
  channels: Channel[];
  onSaveScope: (ids: string[]) => void;
  onSavePerms: (perms: string[]) => void;
}

function GameConfigPanel({ game, channels, onSaveScope, onSavePerms }: GameConfigProps) {
  const [scopeIds, setScopeIds] = useState<Set<string>>(new Set(game.channel_scope));
  const [perms, setPerms] = useState<Set<string>>(new Set(game.permissions));
  const textChannels = channels.filter((c) => !c.is_category);

  function toggleScope(id: string) {
    setScopeIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function togglePerm(p: string) {
    setPerms((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p); else n.add(p);
      return n;
    });
  }

  return (
    <div className="game-config-panel">
      <div className="settings-section">
        <label className="settings-label">Channel availability</label>
        <p className="muted">Empty = available in all channels. Add channels to restrict.</p>
        {textChannels.map((c) => (
          <label key={c.id} className="checkbox-label">
            <input type="checkbox" checked={scopeIds.has(c.id)} onChange={() => toggleScope(c.id)} />
            # {c.name}
          </label>
        ))}
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => onSaveScope([...scopeIds])}>
          Save scope
        </button>
      </div>

      <div className="settings-section">
        <label className="settings-label">Permissions</label>
        <p className="muted">
          Capabilities granted by a hub admin. Players see what a game has before launch.
        </p>
        {ALL_CAPABILITIES.map((cap) => (
          <label key={cap} className="checkbox-label">
            <input type="checkbox" checked={perms.has(cap)} onChange={() => togglePerm(cap)} />
            <code>{cap}</code>
          </label>
        ))}
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => onSavePerms([...perms])}>
          Save permissions
        </button>
      </div>
    </div>
  );
}
