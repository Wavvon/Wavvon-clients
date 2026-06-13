import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { ChallengePrompt, ChallengeResult } from "../types";

export interface BotChallengeProps {
  hubUrl: string;
  pubkey: string;
  onPassed: (token: string) => void;
  onCancel: () => void;
}

type ChallengePhase = "loading" | "click" | "puzzle" | "submitting" | "passed" | "error";

export function BotChallenge({ hubUrl, pubkey, onPassed, onCancel }: BotChallengeProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<ChallengePhase>("loading");
  const [prompt, setPrompt] = useState<ChallengePrompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [wrongMsg, setWrongMsg] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function fetchPrompt() {
    setPhase("loading");
    setAnswer("");
    setWrongMsg(null);
    try {
      const p = await invoke<ChallengePrompt>("challenge_fetch", { hubUrl, pubkey });
      setPrompt(p);
      if (p.mode === "click" || p.mode === "both") {
        setPhase("click");
      } else {
        setPhase("puzzle");
      }
    } catch (e) {
      setFetchError(String(e));
      setPhase("error");
    }
  }

  useEffect(() => {
    fetchPrompt();
  }, []);

  async function handleClick() {
    if (!prompt) return;
    setPhase("submitting");
    try {
      const result = await invoke<ChallengeResult>("challenge_submit", {
        hubUrl,
        id: prompt.id,
        pubkey,
        answer: null,
      });
      if (result.ok) {
        if (result.next_challenge) {
          setPrompt(result.next_challenge);
          setAnswer("");
          setWrongMsg(null);
          setPhase("puzzle");
        } else if (result.token) {
          setPhase("passed");
          setTimeout(() => onPassed(result.token!), 1000);
        }
      } else {
        setPhase("click");
      }
    } catch {
      setPhase("click");
    }
  }

  async function handlePuzzleSubmit() {
    if (!prompt) return;
    setPhase("submitting");
    setWrongMsg(null);
    try {
      const result = await invoke<ChallengeResult>("challenge_submit", {
        hubUrl,
        id: prompt.id,
        pubkey,
        answer: answer.trim(),
      });
      if (result.ok) {
        if (result.next_challenge) {
          setPrompt(result.next_challenge);
          setAnswer("");
          setWrongMsg(null);
          setPhase("puzzle");
        } else if (result.token) {
          setPhase("passed");
          setTimeout(() => onPassed(result.token!), 1000);
        }
      } else {
        const remaining = result.attempts_remaining;
        if (remaining !== null && remaining <= 0) {
          fetchPrompt();
        } else {
          setWrongMsg(
            remaining !== null
              ? `Wrong answer, ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
              : "Wrong answer. Try again."
          );
          setPhase("puzzle");
        }
      }
    } catch {
      setPhase("puzzle");
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal challenge-modal" onClick={(e) => e.stopPropagation()}>
        {phase === "loading" && (
          <p className="muted">{t("modal.loading")}</p>
        )}

        {phase === "error" && (
          <>
            <h3>{t("challenge.unavailable")}</h3>
            <p className="muted">{fetchError}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onCancel}>{t("modal.cancel")}</button>
              <button onClick={fetchPrompt}>{t("modal.retry")}</button>
            </div>
          </>
        )}

        {phase === "click" && (
          <div className="challenge-click-content">
            <p className="muted challenge-subtext">{t("challenge.prompt")}</p>
            <button className="challenge-not-a-bot-btn" onClick={handleClick}>
              {t("challenge.confirm")}
            </button>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onCancel}>{t("modal.cancel")}</button>
            </div>
          </div>
        )}

        {phase === "puzzle" && prompt && (
          <>
            <h3>{t("challenge.quick_check")}</h3>
            {prompt.prompt_svg && (
              <div
                className="challenge-svg-wrap"
                dangerouslySetInnerHTML={{ __html: prompt.prompt_svg }}
              />
            )}
            {wrongMsg && <p className="challenge-wrong-msg">{wrongMsg}</p>}
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePuzzleSubmit(); }}
              placeholder={t("challenge.answer_placeholder")}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onCancel}>{t("modal.cancel")}</button>
              <button
                className="btn-secondary"
                onClick={fetchPrompt}
                style={{ marginRight: "auto" }}
              >
                {t("challenge.new_puzzle")}
              </button>
              <button onClick={handlePuzzleSubmit} disabled={!answer.trim()}>
                {t("modal.send")}
              </button>
            </div>
          </>
        )}

        {phase === "submitting" && (
          <p className="muted">{t("challenge.verifying")}</p>
        )}

        {phase === "passed" && (
          <div className="challenge-passed">
            <span className="challenge-passed-check">&#10003;</span> {t("challenge.verified")}
          </div>
        )}
      </div>
    </div>
  );
}
