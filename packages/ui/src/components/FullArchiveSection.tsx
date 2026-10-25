import { useState } from "react";
import { useTranslation } from "react-i18next";
import { passphraseStrength } from "../utils/passphraseStrength";
import { useConfirm } from "./ConfirmDialog";
import { totalRestored, totalSkipped, type RestoreSummary, type UnrestorableNote } from "../utils/fullArchive";

export interface FullArchiveRestoreResult {
  accountId: string;
  summary: RestoreSummary;
  /** The device had no account before this restore, so there is nothing to
   *  ask: the app switches straight to it. */
  wasFirstAccount: boolean;
}

export interface FullArchiveSectionActions {
  /** Assemble, encrypt and save the archive. Rejects with "export_cancelled"
   *  when the user dismisses a save dialog. Desktop does the identity half in
   *  Rust, so the seed never enters the renderer. */
  exportArchive: (passphrase: string, onProgress: (done: number, total: number) => void) => Promise<void>;
  /** `source` is opaque here: the file's text on web, a path on desktop. */
  pickArchive: () => Promise<{ name: string; source: string } | null>;
  /** Decrypt, resolve or create the archive's account, merge into it. */
  restoreArchive: (source: string, passphrase: string) => Promise<FullArchiveRestoreResult>;
  /** Null when the switch happened, else a refusal already fit to show. */
  switchAccount: (accountId: string) => Promise<string | null>;
}

interface Props {
  canExport: boolean;
  actions: FullArchiveSectionActions;
}

type Mode = "idle" | "export" | "restore";

const ERROR_KEYS: Record<string, string> = {
  unsupported_archive_format: "settings.account.full_archive.error_unsupported",
  archive_too_new: "settings.account.full_archive.error_too_new",
  malformed_archive: "settings.account.full_archive.error_malformed",
  archive_paired_device: "settings.account.full_archive.error_paired_device",
  decrypt_failed: "settings.account.identity_backup.error_decrypt",
};

export function FullArchiveSection({ canExport, actions }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("idle");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // Named askConfirm: `confirm` is already the second passphrase field.
  const { confirm: askConfirm, dialog } = useConfirm();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [picked, setPicked] = useState<{ name: string; source: string } | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);

  function showError(e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    setError(ERROR_KEYS[message] ? t(ERROR_KEYS[message]) : message);
  }

  function noteText(note: UnrestorableNote): string {
    switch (note.kind) {
      case "prefs_gap":
        return t("settings.account.full_archive.note_prefs_gap");
      case "dm_history":
        return t("settings.account.full_archive.note_dm_history", { conversations: note.conversations, messages: note.messages });
      case "hub_records":
        return t("settings.account.full_archive.note_hub_records");
    }
  }

  async function switchTo(accountId: string) {
    const refused = await actions.switchAccount(accountId);
    if (refused) setError(refused);
  }

  async function handleExport() {
    if (passphrase !== confirm) {
      setError(t("settings.account.full_archive.error_mismatch"));
      return;
    }
    if (!passphrase) {
      setError(t("settings.account.full_archive.error_empty"));
      return;
    }
    setWorking(true);
    setError(null);
    setProgress(null);
    try {
      await actions.exportArchive(passphrase, (done, total) => setProgress({ done, total }));
      setMode("idle");
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      if (!(e instanceof Error && e.message === "export_cancelled")) showError(e);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  async function handlePick() {
    const file = await actions.pickArchive();
    if (!file) return;
    setPicked(file);
    setError(null);
  }

  async function handleRestore() {
    if (!picked || !restorePassphrase) {
      setError(t("settings.account.full_archive.error_missing_file"));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const result = await actions.restoreArchive(picked.source, restorePassphrase);
      setMode("idle");
      setRestorePassphrase("");
      setPicked(null);
      setRestoreSummary(result.summary);

      if (result.wasFirstAccount) {
        await switchTo(result.accountId);
        return;
      }
      const ok = await askConfirm({
        title: t("settings.account.full_archive.restore_switch.title"),
        body: t("settings.account.full_archive.restore_switch.body", {
          restored: totalRestored(result.summary),
          skipped: totalSkipped(result.summary),
        }),
        confirmLabel: t("settings.account.full_archive.restore_switch.confirm"),
      });
      if (ok) await switchTo(result.accountId);
    } catch (e) {
      showError(e);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="settings-section">
      {dialog}
      <label className="settings-label">{t("settings.account.full_archive.label")}</label>
      <p className="muted">{t("settings.account.full_archive.hint")}</p>

      {mode === "idle" && restoreSummary && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.full_archive.restore_complete", {
              restored: totalRestored(restoreSummary),
              skipped: totalSkipped(restoreSummary),
            })}
          </p>
          {restoreSummary.unrestorable.map((note) => (
            <p key={note.kind} className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {noteText(note)}
            </p>
          ))}
        </div>
      )}

      {mode === "idle" && error && <p className="error-text">{error}</p>}

      {mode === "idle" && (
        <div className="settings-row">
          <button className="btn-secondary" disabled={!canExport} onClick={() => { setMode("export"); setError(null); }}>
            {t("settings.account.full_archive.open_button")}
          </button>
          <button className="btn-secondary" onClick={() => { setMode("restore"); setError(null); setRestoreSummary(null); }}>
            {t("settings.account.full_archive.restore_button")}
          </button>
        </div>
      )}

      {mode === "export" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)", color: "var(--warning)" }}>
            {t("settings.account.full_archive.warning")}
          </p>
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 4 }}
          />
          {passphrase && (
            <span className={`passphrase-strength ${passphraseStrength(passphrase)}`}>
              {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${passphraseStrength(passphrase)}`) })}
            </span>
          )}
          <input
            type="password"
            placeholder={t("settings.account.full_archive.confirm_passphrase")}
            aria-label={t("settings.account.full_archive.confirm_passphrase")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", margin: "4px 0 8px" }}
          />
          {progress && (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.account.full_archive.progress", { done: progress.done, total: progress.total })}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleExport} disabled={working}>
              {working ? t("settings.account.full_archive.exporting") : t("settings.account.full_archive.export_button")}
            </button>
            <button className="btn-secondary" onClick={() => { setMode("idle"); setError(null); }} disabled={working}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}

      {mode === "restore" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.full_archive.restore_hint")}
          </p>
          <div className="settings-row" style={{ marginBottom: 8 }}>
            <button className="btn-secondary" onClick={handlePick} disabled={working}>
              {t("settings.account.identity_backup.choose_file")}
            </button>
            {picked && <span className="muted">{picked.name}</span>}
          </div>
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleRestore} disabled={working || !picked}>
              {working ? t("settings.account.identity_backup.restoring") : t("settings.account.identity_backup.restore_now")}
            </button>
            <button className="btn-secondary" onClick={() => { setMode("idle"); setError(null); }} disabled={working}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
