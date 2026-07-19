import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { postPairingClaim, getPairingStatus } from "@platform";
import {
  generateSubkeySeed,
  publicKeyHex,
  seedToPhrase,
  phraseToSeed,
  validatePhrase,
  buildPairingClaim,
  resolveOrCreateAccount,
  setActiveAccountId,
  unwrapBlobKey,
  bytesToHex,
  saveIdentity,
  listAccounts,
} from "@identity/index";
import type { IdentityRecord } from "@identity/index";
import { ProfileSetupStep } from "@components/onboarding/ProfileSetupStep";
import { encryptBackup } from "@shared/utils/backupCrypto";
import { suggestBackupFilename } from "@shared/utils/identityBackupPayload";
import { passphraseStrength } from "@shared/utils/passphraseStrength";

export interface IdentitySetupCompletion {
  accountId: string;
  profile?: { display_name: string; avatar: string | null };
}

interface Props {
  // "initial": the only account on a fresh device — goes through the profile
  // step same as before. "add": an additional account alongside ones already
  // on this device — skips the profile step (it would write into the wrong
  // account's profile store before the caller switches into the new one) and
  // offers a way back out.
  variant?: "initial" | "add";
  onComplete: (result: IdentitySetupCompletion) => void;
  onCancel?: () => void;
}

// Identity creation/recovery/pairing flow. Used both for a device's first
// account (variant="initial", full-page) and for adding another account to a
// device that already has one (variant="add", typically shown in an overlay
// by AccountsSwitcherSection).
export function IdentitySetupScreen({ variant = "initial", onComplete, onCancel }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"choose" | "generated" | "recover" | "pair" | "profile" | "label">("choose");
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [generatedSeed, setGeneratedSeed] = useState("");
  const [generatedAccountId, setGeneratedAccountId] = useState("");
  const [showHexBackup, setShowHexBackup] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hexInput, setHexInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairLabel, setPairLabel] = useState("");
  const [pairStatus, setPairStatus] = useState<"idle" | "claiming" | "waiting">("idle");
  const [pendingAccount, setPendingAccount] = useState<IdentityRecord | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [existingAccountCount, setExistingAccountCount] = useState(0);
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [backupLabel, setBackupLabel] = useState("");
  const [backupWorking, setBackupWorking] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupDone, setBackupDone] = useState(false);

  // Snapshot the device's account count once, before this flow adds a row —
  // it feeds the "Account N" label suggestion without counting the very
  // account this screen is about to create.
  useEffect(() => {
    listAccounts().then((accts) => setExistingAccountCount(accts.length));
  }, []);

  function suggestedLabel(): string {
    return t("identity_setup.label.suggestion", { n: existingAccountCount + 1 });
  }

  function finishWithAccount(accountId: string) {
    if (variant === "add") {
      onComplete({ accountId });
    } else {
      // "initial" always means "this becomes the device's active account" —
      // set it explicitly rather than relying on saveIdentity's "only if
      // nothing is active yet" default, which resolveOrCreateAccount skips
      // entirely when the identity already had a row on this device.
      setActiveAccountId(accountId);
      setStep("profile");
      setGeneratedAccountId(accountId);
    }
  }

  // Every "bring an identity onto this device" path (recover, passkey
  // sign-in, pair) funnels through here: a dedupe hit (isNew=false) skips
  // straight to finishing and keeps that account's existing label untouched
  // — only a genuinely new row requires labeling first.
  function proceedAfterResolve(account: IdentityRecord, isNew: boolean) {
    if (!isNew) {
      finishWithAccount(account.id);
      return;
    }
    setPendingAccount(account);
    setLabelDraft(suggestedLabel());
    setStep("label");
  }

  async function finalizeNewAccountLabel() {
    if (!pendingAccount) return;
    const label = labelDraft.trim().slice(0, 48);
    if (!label) return;
    await saveIdentity({ ...pendingAccount, account_label: label });
    finishWithAccount(pendingAccount.id);
  }

  // New-device pairing: generate a fresh subkey, claim the offer with it, and
  // poll until the existing device approves. On completion we persist the seed
  // plus the master-signed cert so this device authenticates as the shared
  // identity.
  async function doPair() {
    setError(null);
    const label = pairLabel.trim() || "New device";
    let decoded: { hub: string; token: string };
    try {
      decoded = JSON.parse(atob(pairCode.trim()));
      if (!decoded.hub || !decoded.token) throw new Error("bad code");
    } catch {
      setError(t("identity_setup.pair.error_invalid_code"));
      return;
    }
    setPairStatus("claiming");
    try {
      const subkeySeed = generateSubkeySeed();
      const subkeyPubkey = publicKeyHex(subkeySeed);
      const claim = buildPairingClaim(subkeySeed, decoded.token, subkeyPubkey, label);
      await postPairingClaim(decoded.hub, claim);
      setPairStatus("waiting");

      const started = Date.now();
      const poll = async (): Promise<void> => {
        if (Date.now() - started > 320_000) {
          setError(t("identity_setup.pair.error_expired_unapproved"));
          setPairStatus("idle");
          return;
        }
        const status = await getPairingStatus(decoded.hub, decoded.token).catch(() => null);
        if (status && status.state === "complete") {
          // Unwrap the canonical DM DH scalar (decisions.md "DH capability
          // via a wrapped canonical scalar") so this device can agree on
          // E2E DM keys as the canonical identity — it never holds the
          // canonical Ed25519 signing seed, only this derived scalar.
          let canonicalDhPrivHex: string | undefined;
          if (status.wrapped_dh_seed_hex) {
            try {
              canonicalDhPrivHex = bytesToHex(unwrapBlobKey(status.wrapped_dh_seed_hex, subkeySeed));
            } catch {
              // Missing/corrupt wrap from an older hub — DM E2E degrades to
              // "no DH key available" for this device rather than blocking
              // pairing entirely.
            }
          }
          const { account, isNew } = await resolveOrCreateAccount(subkeySeed, {
            master_pubkey: status.cert.master_pubkey,
            device_label: label,
            subkey_cert: status.cert,
            canonical_dh_priv_hex: canonicalDhPrivHex,
          });
          proceedAfterResolve(account, isNew);
          return;
        }
        if (status && status.state === "expired") {
          setError(t("identity_setup.pair.error_expired"));
          setPairStatus("idle");
          return;
        }
        setTimeout(() => void poll(), 2000);
      };
      void poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPairStatus("idle");
    }
  }

  async function doGenerate() {
    const seedHex = generateSubkeySeed();
    const { account } = await resolveOrCreateAccount(seedHex);
    setGeneratedSeed(account.seed_hex);
    setGeneratedPhrase(seedToPhrase(account.seed_hex));
    setGeneratedAccountId(account.id);
    setPendingAccount(account);
    setLabelDraft(suggestedLabel());
    setStep("generated");
  }

  // Optional safety net offered right where the phrase is shown: encrypts
  // only the account just created (not the whole device's accounts, unlike
  // the Settings export) into the same `.wavvon-backup` v2 envelope.
  async function doDownloadBackup() {
    if (!pendingAccount) return;
    if (backupPassphrase !== backupConfirm) { setBackupError(t("settings.account.full_archive.error_mismatch")); return; }
    if (!backupPassphrase) { setBackupError(t("settings.account.full_archive.error_empty")); return; }
    setBackupWorking(true);
    setBackupError(null);
    try {
      const blob = await encryptBackup([pendingAccount], backupPassphrase, backupLabel.trim() || null);
      const url = URL.createObjectURL(blob);
      const filename = suggestBackupFilename([pendingAccount], new Date());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setShowBackupForm(false);
      setBackupPassphrase("");
      setBackupConfirm("");
      setBackupLabel("");
      setBackupDone(true);
    } catch (e) {
      setBackupError(String(e));
    } finally {
      setBackupWorking(false);
    }
  }

  async function doRecoverPhrase() {
    setError(null);
    if (!validatePhrase(phrase)) { setError(t("identity_setup.recover.error_invalid_phrase")); return; }
    try {
      const hex = phraseToSeed(phrase);
      const { account, isNew } = await resolveOrCreateAccount(hex);
      proceedAfterResolve(account, isNew);
    } catch (e) { setError(String(e)); }
  }

  async function doRecoverHex() {
    setError(null);
    if (!/^[0-9a-fA-F]{64}$/.test(hexInput)) { setError(t("identity_setup.recover.error_invalid_hex")); return; }
    try {
      const { account, isNew } = await resolveOrCreateAccount(hexInput.toLowerCase());
      proceedAfterResolve(account, isNew);
    } catch (e) { setError(String(e)); }
  }

  if (step === "generated") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>{t("identity_setup.generated.title")}</h2>
        <p className="muted">{t("identity_setup.generated.hint")}</p>
        <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: "var(--r-md)", fontFamily: "monospace", lineHeight: 1.8, marginBottom: 16 }}>{generatedPhrase}</div>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          <button
            className="btn-ghost"
            style={{ fontSize: "inherit", padding: 0, textDecoration: "underline" }}
            onClick={() => setShowHexBackup((v) => !v)}
          >
            {showHexBackup ? t("identity_setup.generated.hide_hex") : t("identity_setup.generated.show_hex")}
          </button>
          {showHexBackup && <code style={{ display: "block", marginTop: 4, wordBreak: "break-all" }}>{generatedSeed}</code>}
        </p>

        <div className="settings-section" style={{ marginBottom: 16 }}>
          <label className="settings-label">{t("identity_setup.backup.label")}</label>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("identity_setup.backup.hint")}</p>

          {backupDone && (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("identity_setup.backup.success")}</p>
          )}

          {!showBackupForm && (
            <button className="btn-secondary" onClick={() => { setShowBackupForm(true); setBackupDone(false); }}>
              {backupDone ? t("identity_setup.backup.download_again_button") : t("identity_setup.backup.reveal_button")}
            </button>
          )}

          {showBackupForm && (
            <div>
              <input
                type="password"
                placeholder={t("settings.account.full_archive.passphrase")}
                aria-label={t("settings.account.full_archive.passphrase")}
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                style={{ width: "100%", marginBottom: 4 }}
              />
              {backupPassphrase && (
                <span className={`passphrase-strength ${passphraseStrength(backupPassphrase)}`}>
                  {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${passphraseStrength(backupPassphrase)}`) })}
                </span>
              )}
              {passphraseStrength(backupPassphrase) === "weak" && backupPassphrase && (
                <p className="muted" style={{ color: "var(--warning, orange)", fontSize: "var(--text-xs)" }}>
                  {t("settings.account.identity_backup.weak_warning")}
                </p>
              )}
              <input
                type="password"
                placeholder={t("settings.account.full_archive.confirm_passphrase")}
                aria-label={t("settings.account.full_archive.confirm_passphrase")}
                value={backupConfirm}
                onChange={(e) => setBackupConfirm(e.target.value)}
                style={{ width: "100%", margin: "4px 0" }}
              />
              <input
                type="text"
                placeholder={t("settings.account.identity_backup.label_field_placeholder")}
                aria-label={t("settings.account.identity_backup.label_field_aria")}
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                style={{ width: "100%", marginBottom: 8 }}
              />
              {backupError && <p className="error-text">{backupError}</p>}
              <div className="settings-row">
                <button onClick={() => void doDownloadBackup()} disabled={backupWorking}>
                  {backupWorking ? t("identity_setup.backup.downloading") : t("identity_setup.backup.download_button")}
                </button>
                <button className="btn-secondary" onClick={() => { setShowBackupForm(false); setBackupError(null); }}>
                  {t("modal.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        <label className="settings-label">{t("identity_setup.label.field_label")}</label>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder={t("identity_setup.label.placeholder")}
          aria-label={t("identity_setup.label.field_label")}
          maxLength={48}
          style={{ width: "100%", marginBottom: 12 }}
        />
        <button
          className="btn-primary"
          onClick={() => void finalizeNewAccountLabel()}
          disabled={!labelDraft.trim()}
          style={{ marginTop: 4 }}
        >
          {t("identity_setup.generated.continue")}
        </button>
      </div>
    );
  }

  if (step === "label" && pendingAccount) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>{t("identity_setup.label.title")}</h2>
        <p className="muted">{t("identity_setup.label.hint")}</p>
        <label className="settings-label">{t("identity_setup.label.field_label")}</label>
        <input
          type="text"
          autoFocus
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && labelDraft.trim()) void finalizeNewAccountLabel(); }}
          placeholder={t("identity_setup.label.placeholder")}
          aria-label={t("identity_setup.label.field_label")}
          maxLength={48}
          style={{ width: "100%", marginBottom: 12 }}
        />
        <button className="btn-primary" onClick={() => void finalizeNewAccountLabel()} disabled={!labelDraft.trim()}>
          {t("identity_setup.label.continue")}
        </button>
      </div>
    );
  }

  if (step === "profile") {
    return (
      <ProfileSetupStep
        onSave={(display_name, avatar) => onComplete({ accountId: generatedAccountId, profile: { display_name, avatar } })}
        onSkip={() => onComplete({ accountId: generatedAccountId })}
      />
    );
  }

  if (step === "recover") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>{t("identity_setup.recover.title")}</h2>
        <label className="settings-label">{t("identity_setup.recover.phrase_label")}</label>
        <textarea rows={3} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={t("identity_setup.recover.phrase_placeholder")} style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={doRecoverPhrase} style={{ marginBottom: 16 }}>{t("identity_setup.recover.from_phrase")}</button>
        <label className="settings-label">{t("identity_setup.recover.hex_label")}</label>
        <input type="text" value={hexInput} onChange={(e) => setHexInput(e.target.value)} placeholder={t("identity_setup.recover.hex_placeholder")} style={{ width: "100%", fontFamily: "monospace", marginBottom: 8 }} />
        <button onClick={doRecoverHex} style={{ marginBottom: 8 }}>{t("identity_setup.recover.from_hex")}</button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <br />
        <button className="btn-ghost" onClick={() => { setStep("choose"); setError(null); }}>{t("modal.back")}</button>
      </div>
    );
  }

  if (step === "pair") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>{t("identity_setup.pair.title")}</h2>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("identity_setup.pair.hint")}
        </p>
        <label className="settings-label">{t("identity_setup.pair.device_name_label")}</label>
        <input
          type="text"
          value={pairLabel}
          onChange={(e) => setPairLabel(e.target.value)}
          placeholder={t("identity_setup.pair.device_name_placeholder")}
          aria-label={t("identity_setup.pair.device_name_label")}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <label className="settings-label">{t("identity_setup.pair.code_label")}</label>
        <textarea
          rows={3}
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value)}
          placeholder={t("identity_setup.pair.code_placeholder")}
          aria-label={t("identity_setup.pair.code_label")}
          style={{ width: "100%", marginBottom: 8, fontFamily: "monospace" }}
        />
        <button className="btn-primary" onClick={doPair} disabled={pairStatus !== "idle" || !pairCode.trim()}>
          {pairStatus === "waiting" ? t("identity_setup.pair.waiting") : pairStatus === "claiming" ? t("identity_setup.pair.linking") : t("identity_setup.pair.submit")}
        </button>
        {pairStatus === "waiting" && (
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 8 }}>
            {t("identity_setup.pair.waiting_hint")}
          </p>
        )}
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <br />
        <button className="btn-ghost" onClick={() => { setStep("choose"); setError(null); setPairStatus("idle"); }}>{t("modal.back")}</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "120px auto", padding: 32, textAlign: "center" }}>
      <h1>{variant === "add" ? t("identity_setup.add.title") : t("app.title")}</h1>
      <p className="muted">{variant === "add" ? t("identity_setup.add.hint") : t("identity_setup.choose.hint")}</p>
      <button className="btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={doGenerate}>
        {t("identity_setup.choose.create")}
      </button>
      <button className="btn-secondary" style={{ width: "100%", marginBottom: 12 }} onClick={() => setStep("recover")}>
        {t("identity_setup.choose.recover")}
      </button>
      <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setStep("pair")}>
        {t("identity_setup.pair.title")}
      </button>
      {error && <p style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
      {variant === "add" && onCancel && (
        <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={onCancel}>
          {t("identity_setup.add.cancel")}
        </button>
      )}
    </div>
  );
}
