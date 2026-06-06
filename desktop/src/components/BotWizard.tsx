import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { BotAdminInfo, BotCreatedResult } from "../types";
import { FocusTrap } from "./FocusTrap";

interface BotWizardProps {
  hubUrl: string;
  onCreated: (bot: BotAdminInfo) => void;
  onClose: () => void;
}

export function BotWizard({ hubUrl, onCreated, onClose }: BotWizardProps) {
  const { t } = useTranslation();
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bot-wizard-title">
        <h3 id="bot-wizard-title">{stage === "name" ? t("bot.wizard.title_create") : t("bot.wizard.title_created")}</h3>

        {stage === "name" && (
          <>
            {error && <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-2)" }}>{error}</p>}
            <div className="settings-section">
              <label className="settings-label">{t("bot.wizard.name_label")}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder={t("bot.wizard.name_placeholder")}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCreate}
                disabled={!displayName.trim() || loading}
              >
                {loading ? t("bot.wizard.creating") : t("bot.wizard.create")}
              </button>
              <button className="btn-secondary" onClick={onClose}>{t("modal.cancel")}</button>
            </div>
          </>
        )}

        {stage === "token" && result && (
          <>
            <p className="bot-token-warning">
              {t("bot.wizard.token_warning")}
            </p>
            <code className="bot-token-box">{result.token}</code>
            <div className="modal-actions">
              <button onClick={handleCopy}>{copied ? t("bot.wizard.copy_copied") : t("bot.wizard.copy_token")}</button>
              <button className="btn-secondary" onClick={handleDone}>{t("modal.confirm")}</button>
            </div>
          </>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
