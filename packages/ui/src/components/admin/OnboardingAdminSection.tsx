import { useEffect, useState } from "react";
import { SettingRow } from "../SettingRow";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { ChallengeDifficulty, ChallengeMode, PendingUser } from "../../types";
import { ChallengePreviewModal } from "./ChallengePreviewModal";

export interface OnboardingAdminSectionActions {
  listPendingUsers: () => Promise<PendingUser[]>;
  approvePendingUser: (publicKey: string) => Promise<void>;
  setLobbySettings: (lobbyEnabled: boolean, welcomeMd?: string) => Promise<void>;
  setChallengeSettings: (mode: ChallengeMode, difficulty: ChallengeDifficulty) => Promise<void>;
  /** Prefills the lobby welcome text from the hub's current setting. The hub
   *  has no GET for lobby-enabled or challenge mode/difficulty, so those two
   *  forms stay write-only (they push new settings; they don't reflect the
   *  current ones) on both platforms. */
  getLobbyWelcome?: () => Promise<{ welcome_md: string }>;
}

interface Props {
  actions: OnboardingAdminSectionActions;
}

// Admission controls: the approval queue, lobby settings, and anti-spam
// challenge.
export function OnboardingAdminSection({ actions }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);

  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [welcomeMd, setWelcomeMd] = useState("");
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>("off");
  const [challengeDifficulty, setChallengeDifficulty] = useState<ChallengeDifficulty>("easy");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  async function loadPending() {
    try { setPending(await actions.listPendingUsers()); }
    catch (e) { setError(String(e)); }
    finally { setPendingLoaded(true); }
  }

  useEffect(() => {
    void loadPending();
    actions.getLobbyWelcome?.().then((w) => setWelcomeMd(w.welcome_md ?? "")).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true); setError(null); setStatus(null);
    try { await fn(); setStatus(ok); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <h1>{t("hub.admin.onboarding.title")}</h1>
      {error && <p className="error-text">{error}</p>}
      {status && <p className="muted">{status}</p>}

      <SettingRow
        step={1}
        title={t("hub.admin.onboarding.challenge_label")}
        state={challengeMode === "off"
          ? t("hub.admin.onboarding.challenge_off")
          : t(`hub.admin.onboarding.mode.${challengeMode}`)}
        {...row("challenge")}
      >
        <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
          <label>{t("hub.admin.onboarding.mode")}{" "}
            <select value={challengeMode} onChange={(e) => setChallengeMode(e.target.value as ChallengeMode)}>
              <option value="off">{t("hub.admin.onboarding.mode.off")}</option>
              <option value="click">{t("hub.admin.onboarding.mode.click")}</option>
              <option value="puzzle">{t("hub.admin.onboarding.mode.puzzle")}</option>
              <option value="both">{t("hub.admin.onboarding.mode.both")}</option>
            </select>
          </label>
          <label>{t("hub.admin.onboarding.difficulty")}{" "}
            <select value={challengeDifficulty} onChange={(e) => setChallengeDifficulty(e.target.value as ChallengeDifficulty)}>
              <option value="easy">{t("hub.admin.onboarding.difficulty.easy")}</option>
              <option value="medium">{t("hub.admin.onboarding.difficulty.medium")}</option>
            </select>
          </label>
          <button className="btn-primary" disabled={busy} onClick={() => run(() => actions.setChallengeSettings(challengeMode, challengeDifficulty), t("hub.admin.onboarding.challenge_saved"))}>
            {t("hub.admin.onboarding.challenge_save")}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)}>
            {t("hub.admin.onboarding.preview")}
          </button>
        </div>
      </SettingRow>
      <SettingRow
        step={2}
        title={t("hub.admin.onboarding.lobby_label")}
        state={lobbyEnabled
          ? t("hub.admin.onboarding.lobby_on")
          : t("hub.admin.onboarding.lobby_off")}
        {...row("lobby")}
      >
        <label className="checkbox-label">
          <input type="checkbox" checked={lobbyEnabled} onChange={(e) => setLobbyEnabled(e.target.checked)} />
          {t("hub.admin.onboarding.lobby_enable")}
        </label>
        <textarea
          value={welcomeMd}
          onChange={(e) => setWelcomeMd(e.target.value)}
          placeholder={t("hub.admin.onboarding.welcome_placeholder")}
          rows={3}
          style={{ width: "100%", marginTop: "var(--space-2)" }}
        />
        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button className="btn-primary" disabled={busy} onClick={() => run(() => actions.setLobbySettings(lobbyEnabled, welcomeMd.trim() || undefined), t("hub.admin.onboarding.lobby_saved"))}>
            {t("hub.admin.onboarding.lobby_save")}
          </button>
        </div>
      </SettingRow>
      <SettingRow
        step={3}
        title={t("hub.admin.onboarding.queue_label")}
        state={!pendingLoaded
          ? t("modal.loading")
          : pending.length === 0
            ? t("hub.admin.onboarding.queue_empty")
            : t("hub.admin.onboarding.queue_waiting", { count: pending.length })}
        attention={pending.length > 0}
        meta={pending.length > 0 ? String(pending.length) : undefined}
        {...row("queue")}
      >
        {pending.length === 0 ? (
          <p className="muted">{t("hub.admin.onboarding.queue_empty")}</p>
        ) : (
          pending.map((u) => (
            <div key={u.public_key} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span>{u.display_name || <span className="member-pk">{formatPubkey(u.public_key)}</span>}</span>
              <button
                className="btn-small"
                disabled={busy}
                onClick={() => run(async () => { await actions.approvePendingUser(u.public_key); await loadPending(); }, t("hub.admin.onboarding.approved"))}
              >
                {t("hub.admin.onboarding.approve")}
              </button>
            </div>
          ))
        )}
      </SettingRow>

      {previewOpen && (
        <ChallengePreviewModal
          mode={challengeMode}
          difficulty={challengeDifficulty}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </section>
  );
}
