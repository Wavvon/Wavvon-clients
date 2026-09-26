import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  version: string;
  notes: string | null;
  onDismiss: () => void;
}

export function UpdateBanner({ version, notes, onDismiss }: Props) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall() {
    setInstalling(true);
    setError(null);
    try {
      await invoke("install_pending_update");
    } catch (e) {
      setInstalling(false);
      setError(String(e));
    }
  }

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-content">
        <span className="update-banner-text">
          {t("update.available", { version })}
          {notes ? ` — ${notes.split("\n")[0]}` : ""}
        </span>
        {error && <span className="update-banner-error">{error}</span>}
      </div>
      <div className="update-banner-actions">
        {installing ? (
          <span className="update-banner-installing">{t("update.installing")}</span>
        ) : (
          <>
            <button onClick={handleInstall}>
              {t("update.install_button")}
            </button>
            <button
              className="btn-secondary"
              onClick={onDismiss}
              aria-label={t("update.dismiss_aria")}
            >
              {t("update.later")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
