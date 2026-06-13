import { useState, useEffect } from "react";
import { FocusTrap } from "./FocusTrap";
import { invoke } from "@tauri-apps/api/core";
import type { BotAdminInfo, BotCreatedResult } from "../types";

interface BotWizardProps {
  hubUrl: string;
  onCreated: (bot: BotAdminInfo) => void;
  onClose: () => void;
}

export function BotWizard({ hubUrl, onCreated, onClose }: BotWizardProps) {
  const [stage, setStage] = useState<"name" | "token">("name");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BotCreatedResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    const name = displayName.trim();
    if (!name || loading) return;
    setLoading(true);
    setError(null);
    try {
      const bot = await invoke<BotCreatedResult>("admin_create_bot", { hubUrl, displayName: name });
      setResult(bot);
      setStage("token");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleDone() {
    if (!result) return;
    const info: BotAdminInfo = {
      public_key: result.public_key,
      display_name: result.display_name,
      created_by: result.created_by,
      created_at: result.created_at,
      webhook_url: null,
    };
    onCreated(info);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bot-wizard-title">
        <h3 id="bot-wizard-title">{stage === "name" ? "Create Bot" : "Bot Created"}</h3>

        {stage === "name" && (
          <>
            {error && <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-2)" }}>{error}</p>}
            <div className="settings-section">
              <label className="settings-label" htmlFor="bot-display-name">Bot display name</label>
              <input
                id="bot-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="My Bot"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCreate}
                disabled={!displayName.trim() || loading}
              >
                {loading ? "Creating…" : "Create"}
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {stage === "token" && result && (
          <>
            <p className="bot-token-warning">
              This token is only shown once. Copy it now — you won't be able to retrieve it later.
            </p>
            <code className="bot-token-box">{result.token}</code>
            <div className="modal-actions">
              <button onClick={handleCopy}>{copied ? "Copied!" : "Copy Token"}</button>
              <button className="btn-secondary" onClick={handleDone}>Done</button>
            </div>
          </>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
