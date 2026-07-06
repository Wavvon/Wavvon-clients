import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLobbyStatus, getLobbyWelcome, submitLobbyPow } from "@platform";
import { powProofString } from "@wavvon/core";
import type { PowOutMessage } from "../workers/powWorker";

export interface LobbyProps {
  hubId: string;
  hubName: string;
  pubkeyHex: string;
  onPromoted: () => void;
}

type ViewState = "loading" | "active" | "promoted";

// Confined lobby screen for a scope="lobby" session (lobby-bot-survey.md
// Feature 1). Self-contained like the other web components — it calls the
// @platform lobby endpoints directly rather than threading state through
// App.tsx, and only reaches out via onPromoted once the hub confirms this
// session has been promoted lobby -> member in place.
export function Lobby({ hubId, hubName, pubkeyHex, onPromoted }: LobbyProps) {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [welcomeMd, setWelcomeMd] = useState<string | null>(null);
  const [requiredLevel, setRequiredLevel] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [paused, setPaused] = useState(false);

  const currentLevelRef = useRef(0);
  useEffect(() => { currentLevelRef.current = currentLevel; }, [currentLevel]);

  const workerRef = useRef<Worker | null>(null);
  const pendingProofRef = useRef<{ nonce: string; level: number } | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [welcome, status] = await Promise.all([
          getLobbyWelcome().catch(() => null),
          getLobbyStatus(),
        ]);
        if (cancelled) return;
        setWelcomeMd(welcome?.welcome_md || null);
        setRequiredLevel(status.required_level);
        setCurrentLevel(status.current_level);
        if (status.status === "member" || (status.required_level > 0 && status.current_level >= status.required_level)) {
          setViewState("promoted");
          setTimeout(onPromoted, 800);
          return;
        }
        setViewState("active");
      } catch {
        setViewState("active");
      }
    }
    void init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId]);

  async function drainSubmitQueue() {
    if (submittingRef.current) return;
    const proof = pendingProofRef.current;
    if (!proof) return;
    submittingRef.current = true;
    pendingProofRef.current = null;
    try {
      const result = await submitLobbyPow(powProofString(BigInt(proof.nonce), proof.level));
      setCurrentLevel((prev) => Math.max(prev, result.new_level));
      if (result.promoted) {
        workerRef.current?.postMessage({ type: "stop" });
        setViewState("promoted");
        setTimeout(onPromoted, 800);
        submittingRef.current = false;
        return;
      }
    } catch {
      // Transient network failure — retry this level; nothing is lost since
      // the worker keeps mining independently of submission outcome.
      pendingProofRef.current = pendingProofRef.current ?? proof;
    }
    submittingRef.current = false;
    if (pendingProofRef.current) void drainSubmitQueue();
  }

  useEffect(() => {
    if (viewState !== "active" || paused || requiredLevel === 0) return;

    const worker = new Worker(new URL("../workers/powWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<PowOutMessage>) => {
      const msg = ev.data;
      setCurrentLevel((prev) => Math.max(prev, msg.level));
      pendingProofRef.current = { nonce: msg.nonce, level: msg.level };
      void drainSubmitQueue();
    };

    worker.postMessage({
      type: "start",
      pubkeyHex,
      targetLevel: requiredLevel,
      startNonce: "0",
      bestLevel: currentLevelRef.current,
    });

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState, paused, requiredLevel, pubkeyHex]);

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

  const pct = requiredLevel > 0 ? Math.min(100, (currentLevel / requiredLevel) * 100) : 100;
  const etaMin = requiredLevel > 0 ? Math.max(0, (requiredLevel - currentLevel) * 2) : 0;

  return (
    <div className="lobby-view">
      <div className="lobby-card">
        <h2 className="lobby-hub-name">{hubName}</h2>
        <p className="lobby-subtitle muted">{t("lobby.title")}</p>

        {welcomeMd && <pre className="lobby-welcome-md">{welcomeMd}</pre>}

        <div className="lobby-progress-card">
          <p className="lobby-progress-label">
            {t("lobby.verifying", { current: currentLevel, required: requiredLevel })}
          </p>
          <div className="lobby-progress-bar">
            <div className="lobby-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {etaMin > 0 && <p className="lobby-eta muted">{t("lobby.eta_min", { min: etaMin })}</p>}
          <div className="lobby-progress-actions">
            {paused ? (
              <button onClick={() => setPaused(false)}>{t("lobby.resume")}</button>
            ) : (
              <button className="btn-secondary" onClick={() => setPaused(true)}>{t("lobby.pause")}</button>
            )}
          </div>
        </div>

        <p className="lobby-footer muted">{t("lobby.auto_promote")}</p>
      </div>
    </div>
  );
}
