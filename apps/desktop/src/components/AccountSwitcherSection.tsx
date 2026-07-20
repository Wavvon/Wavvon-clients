import { useEffect, useState } from "react";
import {
  listAccounts,
  createAccount,
  removeAccount,
  renameAccount,
  switchAccountGuarded,
  SWITCH_BLOCKED_COOLDOWN,
  type AccountSummary,
} from "../accounts/store";

// Minimal multi-account switcher — the desktop analogue of web's Settings →
// Account switcher table. This is deliberately bare-bones (no drag reorder,
// no fingerprint-confirm-to-remove dialog styling); the shared, fully
// designed ManageAccountsTab is a later hoist (settings-ia.md §6 step 2/6).
// It only needs to expose list/create/switch/remove/rename, which is what
// this wires straight into the Rust accounts.rs commands.
export function AccountSwitcherSection() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setAccounts(await listAccounts());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(withPhrase: boolean) {
    setBusyId("__create__");
    setError(null);
    try {
      await createAccount(withPhrase ? { phrase: phrase.trim() } : {});
      setPhrase("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSwitch(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const refusal = await switchAccountGuarded(id);
      if (refusal === SWITCH_BLOCKED_COOLDOWN) {
        setError("Switched too recently — try again in a moment.");
      } else if (refusal) {
        setError(refusal);
      } else {
        await refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(account: AccountSummary) {
    const confirmed = window.confirm(
      `Remove "${account.label ?? account.id.slice(0, 12)}" from this device? This deletes its local identity, cached home hub list, and DM session state. It cannot be undone.`,
    );
    if (!confirmed) return;
    setBusyId(account.id);
    setError(null);
    try {
      await removeAccount(account.id);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(account: AccountSummary) {
    const next = window.prompt("Label for this account", account.label ?? "");
    if (next === null) return;
    setBusyId(account.id);
    setError(null);
    try {
      await renameAccount(account.id, next);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="settings-section">
      <label className="settings-label">Accounts on this device</label>
      <p className="muted">
        Switch between identities you've set up on this device, or add another one.
      </p>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {accounts.map((a) => (
            <div key={a.id} className="settings-row">
              <code className="pubkey-display" title={a.id}>
                {a.label ?? a.id.slice(0, 12)}
              </code>
              {a.is_active ? (
                <span className="muted">Active</span>
              ) : (
                <button onClick={() => handleSwitch(a.id)} disabled={busyId === a.id}>
                  Switch
                </button>
              )}
              <button className="btn-secondary" onClick={() => handleRename(a)} disabled={busyId === a.id}>
                Rename
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleRemove(a)}
                disabled={busyId === a.id || accounts.length <= 1}
                title={accounts.length <= 1 ? "At least one account must remain" : undefined}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="settings-row" style={{ marginTop: 8 }}>
        <button onClick={() => handleCreate(false)} disabled={busyId === "__create__"}>
          + New identity
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>
          Or add an existing account from its recovery phrase
        </label>
        <textarea
          className="recovery-input"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="word1 word2 word3 …"
          rows={2}
        />
        <button
          className="btn-secondary"
          onClick={() => handleCreate(true)}
          disabled={busyId === "__create__" || wordCount !== 24}
        >
          Import
        </button>
      </div>
    </div>
  );
}
