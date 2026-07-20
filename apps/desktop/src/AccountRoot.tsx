import { useEffect, useState } from "react";
import App from "./App";
import { listAccounts, createAccount, setInPlaceSwitchHandler, type AccountSummary } from "./accounts/store";

// Account switching is a key-remount, not a reload -- the desktop analogue
// of web's AccountRoot.tsx (decisions.md "Account switching is an in-place
// key-remount, guarded, not a reload"). Changing <App>'s `key` unmounts the
// outgoing account's whole tree and mounts a fresh one, resetting every
// piece of React state by construction; the Rust side tears down the
// per-account live handles (hub WebSocket sessions) before the flip (see
// accounts::teardown_live_sessions in src-tauri).
//
// Unlike web, "no accounts yet" is a real reachable state here: the
// ~/.wavvon/ restructure starts empty (settings-ia.md §3/§5, alpha rules —
// no migration of the old single-identity file), so this also gates on
// that with a minimal create/import screen. The full switcher table
// (ManageAccountsTab) is a later pass — see the AccountSwitcherSection in
// SettingsPage's Account tab for the equivalent of web's trigger meanwhile.
export default function AccountRoot() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");

  async function refresh() {
    const list = await listAccounts();
    setAccounts(list);
    setActiveAccountId(list.find((a) => a.is_active)?.id ?? list[0]?.id ?? null);
  }

  useEffect(() => {
    setInPlaceSwitchHandler(({ id }) => setActiveAccountId(id));
    refresh().catch((e) => setError(String(e)));
    return () => setInPlaceSwitchHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;

  async function handleCreate(withPhrase: boolean) {
    setBusy(true);
    setError(null);
    try {
      await createAccount(withPhrase ? { phrase: phrase.trim() } : {});
      setPhrase("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (accounts === null) {
    // Brief loading flash only -- avoids a placeholder screen web rejected
    // for the equivalent switch case (decisions.md "no transition overlay").
    return null;
  }

  if (accounts.length === 0) {
    return (
      <div className="account-gate" style={{ maxWidth: 480, margin: "10vh auto", padding: "0 16px" }}>
        <h1>Welcome to Wavvon</h1>
        <p className="muted">
          Create a new identity, or import an existing one from its 24-word recovery phrase, to get
          started.
        </p>
        {error && <p style={{ color: "var(--color-error, red)" }}>{error}</p>}
        <div className="settings-section">
          <button disabled={busy} onClick={() => handleCreate(false)}>
            Create new identity
          </button>
        </div>
        <div className="settings-section">
          <label className="settings-label">Or import from recovery phrase</label>
          <textarea
            className="recovery-input"
            placeholder="word1 word2 word3 …"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            rows={3}
          />
          <button disabled={busy || wordCount !== 24} onClick={() => handleCreate(true)}>
            Import
          </button>
        </div>
      </div>
    );
  }

  return <App key={activeAccountId ?? "no-account"} />;
}
