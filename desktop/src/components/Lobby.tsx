import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { LobbyStatus, SurveySubmitResult } from "../types";
import { SurveyComponent } from "./Survey";

export interface LobbyProps {
  hubUrl: string;
  hubName: string;
  onPromoted: () => void;
}

type LobbyViewState = "loading" | "active" | "promoted";

export function Lobby({ hubUrl, hubName, onPromoted }: LobbyProps) {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState<LobbyViewState>("loading");
  const [lobbyStatus, setLobbyStatus] = useState<LobbyStatus | null>(null);
  const [welcomeMd, setWelcomeMd] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [surveyResult, setSurveyResult] = useState<SurveySubmitResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [welcome, status] = await Promise.all([
          invoke<{ welcome_md: string; hub_name: string; required_level: number }>("lobby_get_welcome", { hubUrl }),
          invoke<LobbyStatus>("lobby_status", { hubUrl }),
        ]);
        if (cancelled) return;
        setWelcomeMd(welcome.welcome_md || null);
        setLobbyStatus(status);

        if (status.status === "promoted" || status.status === "member") {
          setViewState("promoted");
          setTimeout(onPromoted, 800);
          return;
        }

        if (status.required_level === 0) {
          setViewState("active");
          return;
        }

        setViewState("active");
      } catch {
        setViewState("active");
      }
    }

    init();
    return () => { cancelled = true; };
  }, [hubUrl]);

  useEffect(() => {
    if (viewState !== "active") return;
    if (paused) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await invoke<LobbyStatus>("lobby_status", { hubUrl });
        setLobbyStatus(status);
        if (status.status === "promoted" || status.status === "member") {
          clearInterval(pollRef.current!);
          setViewState("promoted");
          setTimeout(onPromoted, 800);
        }
      } catch {
        // poll failure is transient; keep trying
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [viewState, paused, hubUrl]);

  function handleSurveyComplete(result: SurveySubmitResult) {
    setSurveyDone(true);
    setSurveyResult(result);

    if (lobbyStatus && lobbyStatus.required_level === 0) {
      if (result.next_state === "approved") {
        setViewState("promoted");
        setTimeout(onPromoted, 800);
      }
    }
  }

  if (viewState === "loading") {
    return (
      <div className="lobby-view">
        <div className="lobby-card">
          <p className="muted">{t("modal.loading")}</p>
        </div>
      </div>
    );
  }

  if (viewState === "promoted") {
    return (
      <div className="lobby-view">
        <div className="lobby-card">
          <div className="lobby-promoted-badge">{t("lobby.verified_title")}</div>
          <p className="muted">{t("lobby.welcome", { hub: hubName })}</p>
        </div>
      </div>
    );
  }

  const current = lobbyStatus?.current_level ?? 0;
  const required = lobbyStatus?.required_level ?? 0;
  const pct = required > 0 ? Math.min(100, (current / required) * 100) : 100;
  const etaMin = required > 0 ? Math.max(0, (required - current) * 2) : 0;

  const isPendingSurveyApproval =
    surveyDone && surveyResult?.next_state === "pending";

  const noPoW = required === 0;

  return (
    <div className="lobby-view">
      <div className="lobby-card">
        <h2 className="lobby-hub-name">{hubName}</h2>
        <p className="lobby-subtitle muted">{t("lobby.title")}</p>

        {welcomeMd && (
          <pre className="lobby-welcome-md">{welcomeMd}</pre>
        )}

        {!surveyDone && (
          <SurveyComponent
            hubUrl={hubUrl}
            onComplete={handleSurveyComplete}
            embedded
          />
        )}

        {isPendingSurveyApproval && (
          <div className="lobby-pending-notice">
            <p>{t("lobby.pending_approval")}</p>
          </div>
        )}

        {!noPoW && !isPendingSurveyApproval && (
          <div className="lobby-progress-card">
            <p className="lobby-progress-label">
              {t("lobby.verifying", { current, required })}
            </p>
            <div className="lobby-progress-bar">
              <div className="lobby-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            {etaMin > 0 && (
              <p className="lobby-eta muted">{t("lobby.eta_min", { min: etaMin })}</p>
            )}
            <div className="lobby-progress-actions">
              {paused ? (
                <button onClick={() => setPaused(false)}>{t("lobby.resume")}</button>
              ) : (
                <button className="btn-secondary" onClick={() => setPaused(true)}>{t("lobby.pause")}</button>
              )}
            </div>
          </div>
        )}

        {noPoW && !isPendingSurveyApproval && !surveyDone && (
          <p className="lobby-waiting muted">{t("lobby.waiting")}</p>
        )}

        {!noPoW && (
          <p className="lobby-footer muted">
            {t("lobby.auto_promote")}
          </p>
        )}
      </div>
    </div>
  );
}
