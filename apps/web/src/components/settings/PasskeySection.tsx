import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  isPasskeySupported,
  passkeysUsableWith,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
  isNotMemberError,
} from "@platform";
import type { CredentialInfo } from "@platform";
import { getActiveAccountId, type IdentityRecord } from "@identity/index";
import { SettingRow } from "@wavvon/ui";

interface Props {
  publicKey: string | null;
  account: IdentityRecord;
  activeHubUrl: string | undefined;
}

// Passkey management (Settings → Account): list, rename, remove for whichever
// account is selected in AccountTab's "Managing" selector. Passkeys are tied
// to a specific hub, so listing/renaming/removing a non-active account's
// passkeys goes through hubFetchAs (see platform/hubFetchAs.ts) — adding a
// new one still requires switching, since the WebAuthn ceremony itself
// authenticates as whichever account currently holds the browser session.
export function PasskeySection({ publicKey, account, activeHubUrl }: Props) {
  const { t } = useTranslation();
  const accountLabel = account.account_label ?? null;
  const isActive = account.id === getActiveAccountId();
  const [passkeys, setPasskeys] = useState<CredentialInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveHub, setNoActiveHub] = useState(false);
  const [notMember, setNotMember] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [open, setOpen] = useState(false);

  // Not "does this browser do WebAuthn": a passkey is the hub's credential, so
  // the ceremony only works on the page the hub itself serves. Elsewhere the
  // section would list nothing and its button would fail with a SecurityError.
  const supported = passkeysUsableWith(activeHubUrl);
  const wrongOrigin = isPasskeySupported() && !supported;

  useEffect(() => {
    if (!publicKey) return;
    setPasskeys(null);
    setError(null);
    setNoActiveHub(false);
    setNotMember(false);
    listPasskeys(isActive ? undefined : account)
      .then(setPasskeys)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "No active hub") {
          setNoActiveHub(true);
        } else if (isNotMemberError(e)) {
          setNotMember(true);
        } else {
          setError(String(e));
        }
      });
  }, [publicKey, account, isActive]);

  async function handleAdd() {
    if (!publicKey) return;
    setRegistering(true);
    setError(null);
    try {
      await registerPasskey(publicKey, undefined, newKeyName.trim() || undefined);
      setNewKeyName("");
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePasskey(id, isActive ? undefined : account);
      setPasskeys((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await renamePasskey(id, renameValue.trim(), isActive ? undefined : account);
      setRenamingId(null);
      setPasskeys(await listPasskeys(isActive ? undefined : account));
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  const blocked = !supported
    ? t(wrongOrigin ? "settings.account.passkeys.wrong_origin" : "settings.account.passkeys.unsupported")
    : noActiveHub
      ? t("settings.account.passkeys.no_active_hub")
      : notMember
        ? t("settings.account.not_member_notice", { label: accountLabel ?? t("settings.account.this_account_label") })
        : null;

  const state = blocked
    ?? (passkeys === null
      ? t("modal.loading")
      : passkeys.length === 0
        ? t("settings.account.passkeys.empty")
        : t("settings.account.passkeys.state", { count: passkeys.length }));

  return (
    <SettingRow
      title={t("settings.account.passkeys.label")}
      state={state}
      meta={passkeys && passkeys.length > 0 ? String(passkeys.length) : undefined}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      {blocked ? (
        <p className="muted">{blocked}</p>
      ) : (
        <>
          <p className="muted">{t("settings.account.passkeys.hint")}</p>
          {error && <p className="error-text">{error}</p>}
          {passkeys && passkeys.length > 0 && (
            <ul className="device-list">
              {passkeys.map((pk) => (
                <li key={pk.id} className="device-list-item">
                  {renamingId === pk.id ? (
                    <>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={{ flex: 1 }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(pk.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button className="btn-small btn-primary" onClick={() => handleRename(pk.id)}>{t("modal.save")}</button>
                      <button className="btn-small" onClick={() => setRenamingId(null)}>{t("modal.cancel")}</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>
                        {pk.friendly_name ?? t("settings.account.passkeys.unnamed")}
                      </span>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {pk.last_used_at
                          ? t("settings.account.passkeys.used_date", { date: new Date(pk.last_used_at * 1000).toLocaleDateString() })
                          : t("settings.account.passkeys.added_date", { date: new Date(pk.created_at * 1000).toLocaleDateString() })}
                      </span>
                      <button
                        className="btn-small"
                        onClick={() => { setRenamingId(pk.id); setRenameValue(pk.friendly_name ?? ""); }}
                      >
                        {t("settings.account.passkeys.rename_button")}
                      </button>
                      <button className="btn-small danger" onClick={() => handleDelete(pk.id)}>
                        {t("settings.account.passkeys.remove_button")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isActive ? (
            <div className="settings-row" style={{ flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t("settings.account.passkeys.name_placeholder")}
                style={{ width: 200 }}
              />
              <button className="btn-primary" onClick={handleAdd} disabled={registering || !publicKey}>
                {registering ? t("settings.account.passkeys.registering") : t("settings.account.passkeys.add_button")}
              </button>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {t("settings.account.passkeys.switch_to_add", { label: accountLabel ?? t("settings.account.this_account_label") })}
            </p>
          )}
        </>
      )}
    </SettingRow>
  );
}
