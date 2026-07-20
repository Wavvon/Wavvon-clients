import { useEffect, useState } from "react";
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
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [welcomeMd, setWelcomeMd] = useState("");
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>("off");
  const [challengeDifficulty, setChallengeDifficulty] = useState<ChallengeDifficulty>("easy");
  const [previewOpen, setPreviewOpen] = useState(false);

  async function loadPending() {
    try { setPending(await actions.listPendingUsers()); }
    catch (e) { setError(String(e)); }
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
      <h1>Onboarding</h1>
      {error && <p className="error-text">{error}</p>}
      {status && <p className="muted">{status}</p>}

      <div className="settings-section">
        <label className="settings-label">Approval queue</label>
        {pending.length === 0 ? (
          <p className="muted">No one is waiting for approval.</p>
        ) : (
          pending.map((u) => (
            <div key={u.public_key} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span>{u.display_name || <span className="member-pk">{formatPubkey(u.public_key)}</span>}</span>
              <button
                className="btn-small"
                disabled={busy}
                onClick={() => run(async () => { await actions.approvePendingUser(u.public_key); await loadPending(); }, "Approved")}
              >
                Approve
              </button>
            </div>
          ))
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Lobby</label>
        <label className="checkbox-label">
          <input type="checkbox" checked={lobbyEnabled} onChange={(e) => setLobbyEnabled(e.target.checked)} />
          Enable the lobby (new members complete a proof-of-work before joining)
        </label>
        <textarea
          value={welcomeMd}
          onChange={(e) => setWelcomeMd(e.target.value)}
          placeholder="Welcome message (Markdown, optional)"
          rows={3}
          style={{ width: "100%", marginTop: "var(--space-2)" }}
        />
        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button disabled={busy} onClick={() => run(() => actions.setLobbySettings(lobbyEnabled, welcomeMd.trim() || undefined), "Lobby settings saved")}>
            Save lobby settings
          </button>
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Anti-spam challenge</label>
        <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
          <label>Mode{" "}
            <select value={challengeMode} onChange={(e) => setChallengeMode(e.target.value as ChallengeMode)}>
              <option value="off">Off</option>
              <option value="click">Click</option>
              <option value="puzzle">Puzzle</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label>Difficulty{" "}
            <select value={challengeDifficulty} onChange={(e) => setChallengeDifficulty(e.target.value as ChallengeDifficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => run(() => actions.setChallengeSettings(challengeMode, challengeDifficulty), "Challenge settings saved")}>
            Save challenge
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)}>
            Preview
          </button>
        </div>
      </div>

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
