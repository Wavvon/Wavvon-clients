import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import App from "./App";
import { OnboardingFrame, ProfileEditorSection } from "@wavvon/ui";
import { PairingSection } from "./components/PairingSection";
import { listAccounts, createAccount, setInPlaceSwitchHandler, type AccountSummary } from "./accounts/store";
import { buildProfileEditorActions, loadDefaultProfileAsync } from "./utils/profileEditorActions";

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
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [pairing, setPairing] = useState(false);
  // The first account on this device goes through the profile step, as on web.
  const [profileStep, setProfileStep] = useState(false);

  async function refresh() {
    const list = await listAccounts();
    setAccounts(list);
    setActiveAccountId(list.find((a) => a.is_active)?.id ?? list[0]?.id ?? null);
  }

  useEffect(() => {
    setInPlaceSwitchHandler(({ id }) => setActiveAccountId(id));
    refresh().catch((e) => setError(String(e)));
    return () => setInPlaceSwitchHandler(null);
  }, []);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;

  async function handleCreate(withPhrase: boolean) {
    setBusy(true);
    setError(null);
    try {
      await createAccount(withPhrase ? { phrase: phrase.trim() } : {});
      setPhrase("");
      await refresh();
      // Warms the editor's synchronous read of the default profile.
      await loadDefaultProfileAsync().catch(() => null);
      setProfileStep(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickBackup() {
    const path = await open({
      multiple: false,
      filters: [{ name: t("settings.account.identity_backup.file_filter"), extensions: ["wavvon-backup"] }],
    });
    if (typeof path === "string") setBackupPath(path);
  }

  async function handleRestoreBackup() {
    if (!backupPath) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("import_account_backup", { path: backupPath, passphrase: backupPassphrase });
      await refresh();
      await loadDefaultProfileAsync().catch(() => null);
      setProfileStep(true);
    } catch (e) {
      setError(t(String(e) === "unsupported_backup_format"
        ? "settings.account.identity_backup.error_unsupported"
        : "settings.account.identity_backup.error_decrypt"));
    } finally {
      setBusy(false);
    }
  }

  if (accounts === null) {
    // Brief loading flash only -- avoids a placeholder screen web rejected
    // for the equivalent switch case (decisions.md "no transition overlay").
    return null;
  }

  if (accounts.length === 0 && pairing) {
    return (
      <OnboardingFrame>
        <PairingSection hubs={[]} claimOnly onCancel={() => setPairing(false)} onPaired={() => { setPairing(false); refresh().catch((e) => setError(String(e))); }} />
      </OnboardingFrame>
    );
  }

  if (accounts.length === 0) {
    return (
      <OnboardingFrame>
      <div className="account-gate">
        <h1>{t("account_gate.title")}</h1>
        <p className="muted">{t("account_gate.hint")}</p>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="settings-section">
          <button disabled={busy} onClick={() => handleCreate(false)}>
            {t("identity_setup.choose.create")}
          </button>
        </div>
        <div className="settings-section">
          <label className="settings-label">{t("account_gate.import_label")}</label>
          <textarea
            className="recovery-input"
            placeholder={t("identity_setup.recover.phrase_placeholder")}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            rows={3}
          />
          <button disabled={busy || wordCount !== 24} onClick={() => handleCreate(true)}>
            {t("settings.account.accounts.import_button")}
          </button>
        </div>
        <div className="settings-section">
          <label className="settings-label">{t("identity_setup.recover.file_label")}</label>
          <button className="btn-ghost" disabled={busy} onClick={pickBackup}>
            {backupPath ?? t("settings.account.identity_backup.choose_file")}
          </button>
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
          />
          <button disabled={busy || !backupPath} onClick={handleRestoreBackup}>
            {t("identity_setup.recover.from_file")}
          </button>
        </div>
        <div className="settings-section">
          <button className="btn-secondary" disabled={busy} onClick={() => setPairing(true)}>
            {t("identity_setup.pair.title")}
          </button>
        </div>
      </div>
      </OnboardingFrame>
    );
  }

  if (profileStep && activeAccountId) {
    return (
      <OnboardingFrame>
        <h2>{t("onboarding.profile.title")}</h2>
        <p className="onboarding-lede">{t("onboarding.profile.hint")}</p>
        <ProfileEditorSection
          hubs={[]}
          account={{ id: activeAccountId }}
          isActive={false}
          publicKey={null}
          actions={buildProfileEditorActions([])}
          onboarding={{ onSaved: () => setProfileStep(false), onSkip: () => setProfileStep(false) }}
        />
      </OnboardingFrame>
    );
  }

  return <App key={activeAccountId ?? "no-account"} accountId={activeAccountId} />;
}
