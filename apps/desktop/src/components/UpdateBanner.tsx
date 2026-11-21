import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useConfirm } from "@wavvon/ui";
import type { UpdateStatus } from "../hooks/useUpdateBanner";
import { etaSeconds, smoothRate, toMb } from "../utils/updateProgress";

interface Props {
  status: UpdateStatus;
  isInVoice: () => boolean;
  onDismiss: () => void;
}

function useEta(status: UpdateStatus): number | null {
  const rate = useRef<number | null>(null);
  const last = useRef<{ at: number; bytes: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  useEffect(() => {
    if (status.phase !== "downloading") {
      rate.current = null;
      last.current = null;
      setEta(null);
      return;
    }
    const now = performance.now();
    const prev = last.current;
    if (prev && status.downloaded >= prev.bytes && now > prev.at) {
      const sample = ((status.downloaded - prev.bytes) * 1000) / (now - prev.at);
      rate.current = smoothRate(rate.current, sample);
    }
    last.current = { at: now, bytes: status.downloaded };
    setEta(etaSeconds(status.downloaded, status.total, rate.current));
  }, [status.phase, status.downloaded, status.total]);
  return eta;
}

export function UpdateBanner({ status, isInVoice, onDismiss }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const eta = useEta(status);
  const { version, phase, downloaded, total } = status;

  async function handleRestart() {
    if (isInVoice() && !(await confirm({
      title: t("update.restart_in_voice_title"),
      body: t("update.restart_in_voice_body"),
      confirmLabel: t("update.restart_button"),
    }))) return;
    setError(null);
    try {
      await invoke("install_update");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRetry() {
    setError(null);
    try {
      await invoke("retry_update_download");
    } catch (e) {
      setError(String(e));
    }
  }

  let text: string;
  if (phase === "downloading") text = t("update.downloading", { version });
  else if (phase === "ready") text = t("update.ready", { version });
  else if (phase === "installing") text = t("update.installing");
  else text = t("update.failed", { version });

  const shownError = error ?? (phase === "failed" ? status.error : null);
  const later = (
    <button className="btn-secondary" onClick={onDismiss} aria-label={t("update.dismiss_aria")}>
      {t("update.later")}
    </button>
  );

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {dialog}
      <div className="update-banner-content">
        <span className="update-banner-text">
          {text}
          {phase === "ready" && status.notes ? ` — ${status.notes.split("\n")[0]}` : ""}
        </span>
        {phase === "downloading" && (
          <>
            {total ? (
              <progress className="update-banner-progress" value={downloaded} max={total} />
            ) : (
              <progress className="update-banner-progress" />
            )}
            <span className="update-banner-installing">
              {total
                ? t("update.progress_of", { done: toMb(downloaded), total: toMb(total) })
                : t("update.progress_received", { done: toMb(downloaded) })}
              {eta != null &&
                ` · ${eta < 60
                  ? t("update.eta_seconds", { count: eta })
                  : t("update.eta_minutes", { count: Math.ceil(eta / 60) })}`}
            </span>
          </>
        )}
        {shownError && <span className="update-banner-error">{shownError}</span>}
      </div>
      <div className="update-banner-actions">
        {phase === "ready" && (
          <>
            <button className="primary" onClick={handleRestart}>
              {t("update.restart_button")}
            </button>
            {later}
          </>
        )}
        {phase === "failed" && (
          <>
            <button className="primary" onClick={handleRetry}>
              {t("update.retry_button")}
            </button>
            {later}
          </>
        )}
        {phase === "downloading" && later}
      </div>
    </div>
  );
}
