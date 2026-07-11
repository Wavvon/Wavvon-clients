import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { postPairingClaim, getPairingStatus } from "@platform";
import {
  isPasskeySupported,
  isPrfLikelySupported,
  createIdentityWithPasskey,
  restoreIdentityWithPasskey,
  PrfUnsupportedError,
} from "@platform";
import {
  generateSubkeySeed,
  publicKeyHex,
  seedToPhrase,
  phraseToSeed,
  validatePhrase,
  buildPairingClaim,
  resolveOrCreateAccount,
  setActiveAccountId,
} from "@identity/index";
import { ProfileSetupStep } from "@components/onboarding/ProfileSetupStep";

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
  const [step, setStep] = useState<"choose" | "generated" | "recover" | "pair" | "profile" | "passkey_backup">("choose");
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
  const [passkeySupported, setPasskeySupported] = useState(() => isPasskeySupported());
  const [passkeyBusy, setPasskeyBusy] = useState<"idle" | "create" | "signin">("idle");
  const [showPasskeyPhrase, setShowPasskeyPhrase] = useState(false);

  // Best-effort refinement of the initial sync check — hides the passkey
  // paths if the browser can tell us upfront it doesn't support PRF. The
  // ceremony itself still guards with a typed error either way.
  useEffect(() => {
    let cancelled = false;
    isPrfLikelySupported().then((ok) => { if (!cancelled) setPasskeySupported(ok); });
    return () => { cancelled = true; };
  }, []);

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
          const { account } = await resolveOrCreateAccount(subkeySeed, {
            master_pubkey: status.cert.master_pubkey,
            device_label: label,
            subkey_cert: status.cert,
          });
          finishWithAccount(account.id);
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
    setStep("generated");
  }

  function passkeyErrorMessage(e: unknown): string {
    if (e instanceof PrfUnsupportedError) return t("identity_setup.passkey.unsupported");
    return e instanceof Error ? e.message : String(e);
  }

  async function doCreateWithPasskey() {
    setError(null);
    setPasskeyBusy("create");
    try {
      const { seedHex } = await createIdentityWithPasskey();
      const { account } = await resolveOrCreateAccount(seedHex);
      setGeneratedSeed(seedHex);
      setGeneratedAccountId(account.id);
      setShowPasskeyPhrase(false);
      setStep("passkey_backup");
    } catch (e) {
      setError(passkeyErrorMessage(e));
    } finally {
      setPasskeyBusy("idle");
    }
  }

  async function doSignInWithPasskey() {
    setError(null);
    setPasskeyBusy("signin");
    try {
      const seedHex = await restoreIdentityWithPasskey();
      const { account } = await resolveOrCreateAccount(seedHex);
      finishWithAccount(account.id);
    } catch (e) {
      setError(passkeyErrorMessage(e));
    } finally {
      setPasskeyBusy("idle");
    }
  }

  async function doRecoverPhrase() {
    setError(null);
    if (!validatePhrase(phrase)) { setError(t("identity_setup.recover.error_invalid_phrase")); return; }
    try {
      const hex = phraseToSeed(phrase);
      const { account } = await resolveOrCreateAccount(hex);
      finishWithAccount(account.id);
    } catch (e) { setError(String(e)); }
  }

  async function doRecoverHex() {
    setError(null);
    if (!/^[0-9a-fA-F]{64}$/.test(hexInput)) { setError(t("identity_setup.recover.error_invalid_hex")); return; }
    try {
      const { account } = await resolveOrCreateAccount(hexInput.toLowerCase());
      finishWithAccount(account.id);
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
        <button
          className="btn-primary"
          onClick={() => (variant === "add" ? onComplete({ accountId: generatedAccountId }) : setStep("profile"))}
          style={{ marginTop: 16 }}
        >
          {t("identity_setup.generated.continue")}
        </button>
      </div>
    );
  }

  if (step === "passkey_backup") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>{t("identity_setup.passkey.backup_title")}</h2>
        <p className="muted">{t("identity_setup.passkey.backup_hint")}</p>
        {showPasskeyPhrase ? (
          <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: "var(--r-md)", fontFamily: "monospace", lineHeight: 1.8, marginBottom: 16 }}>
            {seedToPhrase(generatedSeed)}
          </div>
        ) : (
          <button
            className="btn-ghost"
            style={{ fontSize: "var(--text-sm)", padding: 0, textDecoration: "underline", marginBottom: 16, display: "block" }}
            onClick={() => setShowPasskeyPhrase(true)}
          >
            {t("identity_setup.passkey.reveal_phrase")}
          </button>
        )}
        <button
          className="btn-primary"
          onClick={() => (variant === "add" ? onComplete({ accountId: generatedAccountId }) : setStep("profile"))}
          style={{ marginTop: 8 }}
        >
          {t("identity_setup.passkey.continue")}
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
      {passkeySupported && (
        <>
          <button
            className="btn-primary"
            style={{ width: "100%", marginBottom: 12 }}
            onClick={doCreateWithPasskey}
            disabled={passkeyBusy !== "idle"}
          >
            {passkeyBusy === "create" ? t("identity_setup.passkey.working") : t("identity_setup.passkey.create_cta")}
          </button>
          <button
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 20 }}
            onClick={doSignInWithPasskey}
            disabled={passkeyBusy !== "idle"}
          >
            {passkeyBusy === "signin" ? t("identity_setup.passkey.working") : t("identity_setup.passkey.signin_cta")}
          </button>
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>{t("identity_setup.passkey.divider")}</p>
        </>
      )}
      <button className="btn-secondary" style={{ width: "100%", marginBottom: 12 }} onClick={doGenerate}>
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
