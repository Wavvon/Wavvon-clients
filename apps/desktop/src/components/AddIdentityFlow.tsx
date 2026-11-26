import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { seedToPhrase, validatePhrase } from "@wavvon/core";
import { OnboardingFrame } from "@wavvon/ui";
import { createAccount, listAccounts, renameAccount, type AccountSummary } from "../accounts/store";
import { PairingSection } from "./PairingSection";

type Step = "choose" | "generated" | "recover" | "label" | "pair";

interface ImportedAccount extends AccountSummary {
  is_new: boolean;
}

function randomSeedHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bringing an identity onto this device: create one, recover one from its
 * phrase or a backup file, or pair with a device that has it. The same steps,
 * words and look as web's IdentitySetupScreen; the work is the desktop's own
 * accounts.rs commands. "initial" is the first account of a fresh install,
 * "add" one more beside the others (with a way back out).
 */
export function AddIdentityFlow({ variant, onDone, onCancel }: {
  variant: "initial" | "add";
  /** The account brought here; null after pairing, which reports its own. */
  onDone: (account: AccountSummary | null) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [generated, setGenerated] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState<AccountSummary | null>(null);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");

  async function suggestedLabel(): Promise<string> {
    const n = (await listAccounts().catch(() => [])).length + 1;
    return t("identity_setup.label.suggestion", { n });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // The phrase is shown before anything is written: the account is created
  // from it only once it has a name, so nothing nameless ever lands here.
  async function startCreate() {
    setGenerated(seedToPhrase(randomSeedHex()));
    setLabel(await suggestedLabel());
    setStep("generated");
  }

  const finishCreate = () => run(async () => {
    const account = await createAccount({ phrase: generated, label: label.trim().slice(0, 48) });
    onDone(account);
  });

  // A recovered identity that is already here keeps its name; a new one asks
  // for one, as web does.
  async function afterResolve(account: AccountSummary, isNew: boolean) {
    if (!isNew) {
      onDone(account);
      return;
    }
    setPending(account);
    setLabel(account.label || (await suggestedLabel()));
    setStep("label");
  }

  const recoverPhrase = () => run(async () => {
    if (!validatePhrase(phrase.trim())) {
      setError(t("identity_setup.recover.error_invalid_phrase"));
      return;
    }
    const before = new Set((await listAccounts()).map((a) => a.id));
    const id = await invoke<string>("recover_identity_from_phrase", { phrase: phrase.trim() });
    const account = (await listAccounts()).find((a) => a.id === id);
    if (account) await afterResolve(account, !before.has(id));
  });

  async function pickBackup() {
    const path = await open({
      multiple: false,
      filters: [{ name: t("settings.account.identity_backup.file_filter"), extensions: ["wavvon-backup"] }],
    });
    if (typeof path === "string") setBackupPath(path);
  }

  const recoverFile = () => run(async () => {
    if (!backupPath) return;
    try {
      const imported = await invoke<ImportedAccount>("import_account_backup", { path: backupPath, passphrase: backupPassphrase });
      await afterResolve(imported, imported.is_new);
    } catch (e) {
      const msg = String(e);
      setError(msg === "unsupported_backup_format"
        ? t("settings.account.identity_backup.error_unsupported")
        : msg === "decrypt_failed"
          ? t("settings.account.identity_backup.error_decrypt")
          : t("settings.account.identity_backup.error_other", { error: msg }));
    }
  });

  const finishLabel = () => run(async () => {
    if (!pending) return;
    const named = await renameAccount(pending.id, label.trim().slice(0, 48));
    onDone(named);
  });

  const back = <button className="btn-ghost" onClick={() => { setStep("choose"); setError(null); }}>{t("modal.back")}</button>;
  const err = error && <p style={{ color: "var(--danger)" }}>{error}</p>;

  if (step === "generated") {
    return (
      <OnboardingFrame>
        <h2>{t("identity_setup.generated.title")}</h2>
        <p className="onboarding-lede">{t("identity_setup.generated.hint")}</p>
        <div className="recovery-phrase">
          {generated.split(/\s+/).filter(Boolean).map((word, i) => <span key={`${i}-${word}`}>{word}</span>)}
        </div>
        <div className="onboarding-field">
          <label htmlFor="account-label">{t("identity_setup.label.field_label")}</label>
          <input
            id="account-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("identity_setup.label.placeholder")}
            maxLength={48}
          />
        </div>
        {err}
        <button className="btn-primary" onClick={() => void finishCreate()} disabled={busy || !label.trim()}>
          {t("identity_setup.generated.continue")}
        </button>
        {back}
      </OnboardingFrame>
    );
  }

  if (step === "label" && pending) {
    return (
      <OnboardingFrame>
        <h2>{t("identity_setup.label.title")}</h2>
        <p className="onboarding-lede">{t("identity_setup.label.hint")}</p>
        <label className="onboarding-field-label">{t("identity_setup.label.field_label")}</label>
        <input
          type="text"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) void finishLabel(); }}
          placeholder={t("identity_setup.label.placeholder")}
          aria-label={t("identity_setup.label.field_label")}
          maxLength={48}
          style={{ width: "100%", marginBottom: 12 }}
        />
        {err}
        <button className="btn-primary" onClick={() => void finishLabel()} disabled={busy || !label.trim()}>
          {t("identity_setup.label.continue")}
        </button>
      </OnboardingFrame>
    );
  }

  if (step === "recover") {
    return (
      <OnboardingFrame>
        <h2>{t("identity_setup.recover.title")}</h2>
        <label className="onboarding-field-label">{t("identity_setup.recover.phrase_label")}</label>
        <textarea rows={3} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={t("identity_setup.recover.phrase_placeholder")} style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={() => void recoverPhrase()} disabled={busy} style={{ marginBottom: 16 }}>{t("identity_setup.recover.from_phrase")}</button>
        <label className="onboarding-field-label">{t("identity_setup.recover.file_label")}</label>
        <button className="btn-secondary" disabled={busy} onClick={() => void pickBackup()} style={{ marginBottom: 8 }}>
          {backupPath ?? t("settings.account.identity_backup.choose_file")}
        </button>
        <input type="password" value={backupPassphrase} onChange={(e) => setBackupPassphrase(e.target.value)} placeholder={t("settings.account.full_archive.passphrase")} aria-label={t("settings.account.full_archive.passphrase")} style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={() => void recoverFile()} disabled={busy || !backupPath} style={{ marginBottom: 8 }}>{t("identity_setup.recover.from_file")}</button>
        {err}
        <br />
        {back}
      </OnboardingFrame>
    );
  }

  if (step === "pair") {
    return (
      <OnboardingFrame>
        <PairingSection hubs={[]} claimOnly onCancel={() => setStep("choose")} onPaired={() => onDone(null)} />
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame>
      <h1>{variant === "add" ? t("identity_setup.add.title") : t("identity_setup.choose.headline")}</h1>
      <p className="onboarding-lede">{variant === "add" ? t("identity_setup.add.hint") : t("identity_setup.choose.hint")}</p>
      {/* Each option says what it does to your keys: that is the only
          difference between them. */}
      <button className="choice primary" onClick={() => void startCreate()}>
        <span className="choice-title">{t("identity_setup.choose.create")}</span>
        <span className="choice-hint">{t("identity_setup.choose.create_hint")}</span>
      </button>
      <button className="choice" onClick={() => setStep("recover")}>
        <span className="choice-title">{t("identity_setup.choose.recover")}</span>
        <span className="choice-hint">{t("identity_setup.choose.recover_hint")}</span>
      </button>
      <button className="choice" onClick={() => setStep("pair")}>
        <span className="choice-title">{t("identity_setup.pair.title")}</span>
        <span className="choice-hint">{t("identity_setup.choose.pair_hint")}</span>
      </button>
      {err}
      {variant === "add" && onCancel && (
        <button className="btn-ghost" style={{ marginTop: 12 }} onClick={onCancel}>
          {t("identity_setup.add.cancel")}
        </button>
      )}
    </OnboardingFrame>
  );
}
