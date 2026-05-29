import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledGame, Channel } from "../types";

const ALL_CAPABILITIES = [
  { id: "post_message", label: "Post messages as the launching user" },
  { id: "read_channel_history", label: "Read recent channel messages" },
  { id: "list_channel_users", label: "List online users in the channel" },
];

function disclosureStrip(permissions: string[]): string {
  const parts: string[] = [];
  if (permissions.includes("post_message")) parts.push("post messages as you");
  if (permissions.includes("read_channel_history")) parts.push("read recent messages");
  if (permissions.includes("list_channel_users")) parts.push("list channel users");
  if (parts.length === 0) return "";
  return `This game can: ${parts.join(", ")}.`;
}

interface InstallForm {
  mode: "quick" | "manifest";
  name: string;
  url: string;
  manifestPreview: InstalledGame | null;
  fetching: boolean;
  error: string;
}

interface Props {
  hubUrl: string;
  channels: Channel[];
}

export function GamesAdminSection({ hubUrl, channels }: Props) {
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [form, setForm] = useState<InstallForm>({
    mode: "quick", name: "", url: "", manifestPreview: null, fetching: false, error: "",
  });
  const [installing, setInstalling] = useState(false);

  const textChannels = channels.filter((c) => !c.is_category);

  useEffect(() => {
    invoke<InstalledGame[]>("list_admin_games", { hubUrl }).then(setGames).catch(() => setGames([])).finally(() => setLoading(false));
  }, [hubUrl]);

  async function fetchManifest() {
    setForm((f) => ({ ...f, fetching: true, error: "", manifestPreview: null }));
    try {
      const preview = await invoke<InstalledGame>("fetch_game_manifest", { manifestUrl: form.url });
      setForm((f) => ({ ...f, fetching: false, manifestPreview: preview }));
    } catch (e) {
      setForm((f) => ({ ...f, fetching: false, error: String(e) }));
    }
  }

  async function handleInstall() {
    setInstalling(true);
    try {
      const game = await invoke<InstalledGame>("install_game", {
        hubUrl,
        name: form.mode === "quick" ? form.name : (form.manifestPreview?.name ?? form.name),
        entryUrl: form.mode === "quick" ? form.url : undefined,
        manifestUrl: form.mode === "manifest" ? form.url : undefined,
      });
      setGames((prev) => [...prev, game]);
      setShowInstall(false);
      setForm({ mode: "quick", name: "", url: "", manifestPreview: null, fetching: false, error: "" });
    } catch (e) {
      setForm((f) => ({ ...f, error: String(e) }));
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall(gameId: string) {
    try {
      await invoke("uninstall_game", { hubUrl, gameId });
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch {
      // noop
    }
  }

  async function handlePermissionToggle(gameId: string, cap: string, currentPerms: string[]) {
    const next = currentPerms.includes(cap)
      ? currentPerms.filter((p) => p !== cap)
      : [...currentPerms, cap];
    try {
      await invoke("set_game_permissions", { hubUrl, gameId, permissions: next });
      setGames((prev) => prev.map((g) => g.id === gameId ? { ...g, permissions: next } : g));
    } catch {
      // noop
    }
  }

  async function handleChannelToggle(gameId: string, channelId: string, currentIds: string[]) {
    const next = currentIds.includes(channelId)
      ? currentIds.filter((id) => id !== channelId)
      : [...currentIds, channelId];
    try {
      await invoke("set_game_channels", { hubUrl, gameId, channelIds: next });
      setGames((prev) => prev.map((g) => g.id === gameId ? { ...g, channel_ids: next } : g));
    } catch {
      // noop
    }
  }

  if (loading) return <p className="muted">Loading games…</p>;

  return (
    <div>
      <div className="settings-row" style={{ marginBottom: 16 }}>
        <button onClick={() => setShowInstall((v) => !v)}>
          {showInstall ? "Cancel" : "Install game…"}
        </button>
      </div>

      {showInstall && (
        <div className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 16, marginBottom: 16 }}>
          <label className="settings-label">Install game</label>
          <div className="settings-row" style={{ marginBottom: 8 }}>
            <label className="checkbox-label">
              <input type="radio" checked={form.mode === "quick"} onChange={() => setForm((f) => ({ ...f, mode: "quick" }))} />
              Quick install
            </label>
            <label className="checkbox-label">
              <input type="radio" checked={form.mode === "manifest"} onChange={() => setForm((f) => ({ ...f, mode: "manifest" }))} />
              Manifest URL
            </label>
          </div>
          {form.mode === "quick" ? (
            <>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Game name"
                style={{ marginBottom: 8 }}
              />
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="Game entry URL (https://…)"
              />
            </>
          ) : (
            <>
              <div className="settings-row">
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, manifestPreview: null }))}
                  placeholder="Manifest URL (https://…/manifest.json)"
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" onClick={fetchManifest} disabled={form.fetching || !form.url.trim()}>
                  {form.fetching ? "Fetching…" : "Preview"}
                </button>
              </div>
              {form.manifestPreview && (
                <div className="settings-section" style={{ marginTop: 8 }}>
                  <strong>{form.manifestPreview.name}</strong>
                  {form.manifestPreview.description && <p className="muted">{form.manifestPreview.description}</p>}
                  {form.manifestPreview.thumbnail_url && (
                    <img src={form.manifestPreview.thumbnail_url} alt="Thumbnail" style={{ maxWidth: 80, maxHeight: 80, borderRadius: 4, marginTop: 4 }} />
                  )}
                </div>
              )}
            </>
          )}
          {form.error && <p className="error-text">{form.error}</p>}
          <div className="settings-row" style={{ marginTop: 8 }}>
            <button
              onClick={handleInstall}
              disabled={installing || (form.mode === "quick" ? (!form.name.trim() || !form.url.trim()) : (!form.manifestPreview && !form.url.trim()))}
            >
              {installing ? "Installing…" : "Install"}
            </button>
          </div>
        </div>
      )}

      {games.length === 0 && <p className="muted">No games installed.</p>}

      {games.map((game) => {
        const perms = game.permissions ?? [];
        const channelIds = game.channel_ids ?? [];
        const disclosure = disclosureStrip(perms);
        return (
          <div key={game.id} className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 12, marginBottom: 12 }}>
            <div className="settings-row">
              <div>
                {game.thumbnail_url && (
                  <img src={game.thumbnail_url} alt={game.name} style={{ width: 32, height: 32, borderRadius: 4, marginRight: 8, verticalAlign: "middle" }} />
                )}
                <strong>{game.name}</strong>
                {game.version && <span className="muted" style={{ marginLeft: 8 }}>v{game.version}</span>}
                {game.author && <span className="muted" style={{ marginLeft: 8 }}>by {game.author}</span>}
              </div>
              <button className="btn-secondary" style={{ color: "var(--color-error, red)" }} onClick={() => handleUninstall(game.id)}>
                Uninstall
              </button>
            </div>

            {disclosure && (
              <p className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)", background: "var(--surface-2)", borderRadius: 4, padding: "4px 8px" }}>
                {disclosure}
              </p>
            )}

            <div style={{ marginTop: 10 }}>
              <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>Capability grants</label>
              {ALL_CAPABILITIES.map((cap) => (
                <label key={cap.id} className="checkbox-label" style={{ display: "block", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={perms.includes(cap.id)}
                    onChange={() => handlePermissionToggle(game.id, cap.id, perms)}
                  />
                  {cap.label}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>
                Visible in channels {channelIds.length === 0 ? "(all channels)" : `(${channelIds.length} selected)`}
              </label>
              <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Leave all unchecked for all channels.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {textChannels.map((ch) => (
                  <label key={ch.id} className="checkbox-label" style={{ marginRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={channelIds.includes(ch.id)}
                      onChange={() => handleChannelToggle(game.id, ch.id, channelIds)}
                    />
                    #{ch.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
