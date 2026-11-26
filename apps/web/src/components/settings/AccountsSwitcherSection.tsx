import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import {
  listAccountsOrdered,
  getActiveAccountId,
  saveIdentity,
  removeAccount,
  switchAccount,
  switchCooldownRemainingMs,
  SWITCH_BLOCKED_COOLDOWN,
  setAccountOrder,
  holdsMasterSeed,
  seedToPhrase,
  type IdentityRecord,
} from "@identity/index";
import { identityNeedsBackup, markIdentityBackedUp } from "../../utils/identityBackup";
import { IdentitySetupScreen } from "@components/identity/IdentitySetupScreen";
import { AccountList } from "@wavvon/ui";

// Short, typeable identifier for the "type to confirm" removal guard — the
// formatted fingerprint (formatPubkey) contains an ellipsis and dashes that
// aren't practical to retype.
function shortFingerprint(id: string): string {
  return id.slice(0, 8);
}

// How long a removal can be undone before the record is actually deleted.
const UNDO_MS = 8000;

interface Props {
  // Whether this device's active account is currently joined to a voice
  // channel — switching is blocked outright while true (not auto-left).
  inVoice?: boolean;
  onBackedUp?: () => void;
}

// Accounts are device-local: this list is just every row in the identity
// store (see identity/store.ts) — there is no server-side account registry
// and nothing here is ever synced to a hub.
export function AccountsSwitcherSection({ inVoice = false, onBackedUp }: Props) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<IdentityRecord[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeConfirmText, setRemoveConfirmText] = useState("");
  // An identity that never left this device: its phrase shown inline, or the
  // user's explicit choice to delete it anyway.
  const [removePhrase, setRemovePhrase] = useState<string | null>(null);
  const [removeAnyway, setRemoveAnyway] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<IdentityRecord | null>(null);
  const pendingRef = useRef<{ id: string; wasActive: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // No countdown UI — this just re-renders often enough that the Switch
  // buttons re-enable themselves once the cooldown (switchCooldownRemainingMs)
  // actually expires, without polling a fixed timeout tied to the cooldown
  // constant itself.
  const [, forceCooldownTick] = useState(0);

  function refresh() {
    listAccountsOrdered().then(setAccounts);
    setActiveId(getActiveAccountId());
  }

  useEffect(() => {
    refresh();
    // Leaving settings while an undo is still on offer means the user let it
    // stand: commit it rather than drop it.
    return () => void commitRemoval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceCooldownTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const cooldownActive = switchCooldownRemainingMs() > 0;

  function handleSwitchClick(accountId: string) {
    setSwitchError(null);
    const refused = switchAccount(accountId, "settings-account");
    if (refused) {
      setSwitchError(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
    }
  }

  async function renameTo(account: IdentityRecord, label: string) {
    await saveIdentity({ ...account, account_label: label });
    refresh();
  }

  function startRemove(id: string) {
    setRemovingId(id);
    setRemoveConfirmText("");
    setRemovePhrase(null);
    setRemoveAnyway(false);
  }

  function showPhraseBeforeRemoval(account: IdentityRecord) {
    setRemovePhrase(seedToPhrase(account.seed_hex));
    markIdentityBackedUp(account.id);
    onBackedUp?.();
  }

  // The delete is written only once the undo window closes, so an undo just
  // forgets the pending entry.
  function confirmRemove(account: IdentityRecord) {
    if (removeConfirmText.trim().toLowerCase() !== shortFingerprint(account.id)) return;
    void commitRemoval();
    setRemovingId(null);
    setRemovePhrase(null);
    pendingRef.current = {
      id: account.id,
      wasActive: account.id === activeId,
      timer: setTimeout(() => void commitRemoval(), UNDO_MS),
    };
    setPendingRemoval(account);
  }

  function undoRemoval() {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    setPendingRemoval(null);
  }

  async function commitRemoval() {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    await removeAccount(pending.id);
    setPendingRemoval(null);
    if (pending.wasActive) {
      window.location.reload();
    } else {
      refresh();
    }
  }

  // Reorders the in-memory list immediately (so the drop/keystroke feels
  // instant) and writes the new positions to IndexedDB in the background.
  async function persistOrder(newIds: string[]) {
    const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
    const reordered = newIds.map((id) => byId.get(id)).filter((a): a is IdentityRecord => !!a);
    setAccounts(reordered);
    await setAccountOrder(newIds);
  }

  if (showAdd) {
    return (
      <div className="settings-section">
        <IdentitySetupScreen
          variant="add"
          onCancel={() => setShowAdd(false)}
          onComplete={() => {
            // Adding an account no longer switches to it automatically — it
            // just lands in the list below, unswitched, until the user picks
            // Switch on its row.
            setShowAdd(false);
            refresh();
          }}
        />
      </div>
    );
  }

  const removingAccount = accounts?.find((a) => a.id === removingId) ?? null;

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.accounts.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
        {t("settings.account.accounts.hint")}
      </p>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {t("settings.account.accounts.pubkey_hint")}
      </p>
      {switchError && <p className="error-text" style={{ marginBottom: 8 }}>{switchError}</p>}
      {pendingRemoval && (
        <div className="settings-row" style={{ marginBottom: 8 }} role="status">
          <span>{t("settings.account.accounts.removed_notice", { label: pendingRemoval.account_label || formatPubkey(pendingRemoval.id) })}</span>
          <button type="button" className="btn-small btn-secondary" onClick={undoRemoval}>
            {t("settings.account.accounts.remove_undo")}
          </button>
        </div>
      )}

      <AccountList
        accounts={(accounts ?? []).filter((a) => a.id !== pendingRemoval?.id).map((a) => ({
          id: a.id,
          label: a.account_label || null,
          publicKey: a.canonical_pubkey ?? a.id,
          active: a.id === activeId,
        }))}
        switchBlockedReason={inVoice ? t("settings.account.accounts.switch_blocked_voice") : cooldownActive ? t("settings.account.accounts.switch_cooldown") : null}
        onSwitch={handleSwitchClick}
        onRename={(id, label) => { const acc = accounts?.find((x) => x.id === id); if (acc) void renameTo(acc, label); }}
        onRemove={startRemove}
        onReorder={(ids) => void persistOrder(ids)}
      />
      {removingAccount && (() => {
        const account = removingAccount;
        const fp = shortFingerprint(account.id);
        const unsaved = identityNeedsBackup(account);
        const paired = !holdsMasterSeed(account);
        return (
          <div className="account-remove-panel" role="group" aria-label={t("settings.account.accounts.remove_title", { label: account.account_label || formatPubkey(account.id) })}>
            <strong>{t("settings.account.accounts.remove_title", { label: account.account_label || formatPubkey(account.id) })}</strong>

              {removePhrase ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>{t("settings.account.accounts.remove_phrase_hint")}</p>
                  <code style={{ display: "block", margin: "6px 0", userSelect: "all" }}>{removePhrase}</code>
                </>
              ) : unsaved ? (
                <p className="error-text" style={{ margin: 0 }}>{t("settings.account.accounts.remove_unsaved_warning")}</p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {t(paired ? "settings.account.accounts.remove_paired_hint" : "settings.account.accounts.remove_backed_up_hint")}{" "}
                  {t("settings.account.accounts.remove_type_fingerprint")}
                </p>
              )}
              {unsaved && !removePhrase && !removeAnyway ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                  <button type="button" className="btn-small" onClick={() => showPhraseBeforeRemoval(account)}>
                    {t("settings.account.accounts.remove_show_phrase")}
                  </button>
                  <button type="button" className="btn-small btn-secondary" onClick={() => setRemovingId(null)}>
                    {t("settings.account.accounts.remove_cancel")}
                  </button>
                  <button type="button" className="btn-small btn-danger" onClick={() => setRemoveAnyway(true)}>
                    {t("settings.account.accounts.remove_anyway")}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                  <input
                    type="text"
                    value={removeConfirmText}
                    onChange={(e) => setRemoveConfirmText(e.target.value)}
                    placeholder={t("settings.account.accounts.remove_confirm_placeholder", { fingerprint: fp })}
                    style={{ fontFamily: "monospace" }}
                  />
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    disabled={removeConfirmText.trim().toLowerCase() !== fp}
                    onClick={() => confirmRemove(account)}
                  >
                    {t("settings.account.accounts.remove_confirm_button")}
                  </button>
                  <button type="button" className="btn-small btn-secondary" onClick={() => setRemovingId(null)}>
                    {t("settings.account.accounts.remove_cancel")}
                  </button>
                </div>
              )}
          </div>
        );
      })()}

      <div className="settings-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setShowAdd(true)}>
          {t("settings.account.accounts.add")}
        </button>
      </div>
    </div>
  );
}
