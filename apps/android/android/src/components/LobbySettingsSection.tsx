import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function LobbySettingsSection({ hubUrl }: { hubUrl: string }) {
  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [welcomeMd, setWelcomeMd] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ welcome_md: string; hub_name: string; required_level: number }>(
      "lobby_get_welcome",
      { hubUrl }
    )
      .then((w) => {
        setWelcomeMd(w.welcome_md ?? "");
      })
      .catch(() => {});
  }, [hubUrl]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await invoke("set_lobby_settings", {
        hubUrl,
        lobbyEnabled,
        welcomeMd: welcomeMd.trim() || null,
      });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1>Lobby</h1>
      <p className="muted">
        When enabled, new members whose proof-of-work level is below the hub
        minimum land in a lobby state until they reach the threshold.
      </p>

      <div className="settings-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={lobbyEnabled}
            onChange={(e) => setLobbyEnabled(e.target.checked)}
          />
          Enable lobby
        </label>
      </div>

      <div className="settings-section">
        <label className="settings-label" htmlFor="lobby-welcome-msg">Welcome message</label>
        <p className="muted">
          Shown to users while they wait. Supports plain text (max 1000 characters).
        </p>
        <textarea
          id="lobby-welcome-msg"
          rows={6}
          maxLength={1000}
          value={welcomeMd}
          onChange={(e) => setWelcomeMd(e.target.value)}
          placeholder="Welcome to the hub! Verification will complete shortly…"
        />
        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
          {welcomeMd.length} / 1000
        </span>
      </div>

      <div className="settings-section">
        {saveMsg && <p className="muted">{saveMsg}</p>}
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
