import { useState } from "react";
import { useTranslation } from "react-i18next";

export function RestoreIdentitySection({
  onRestore,
}: {
  onRestore: (phrase: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
  const looksValid = wordCount === 24;

  async function handleRestore() {
    if (!looksValid) return;
    const ok = confirm(t("settings.account.restore.confirm"));
    if (!ok) return;
    setBusy(true);
    try {
      await onRestore(phrase.trim());
      setPhrase("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.restore.label")}</label>
      <p className="muted">{t("settings.account.restore.hint")}</p>
      <textarea
        className="recovery-input"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder={t("identity_setup.recover.phrase_placeholder")}
        rows={3}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <div className="recovery-input-footer">
        <span className="muted">{t("settings.account.restore.word_count", { count: wordCount })}</span>
        <button
          className="btn-secondary"
          disabled={!looksValid || busy}
          onClick={handleRestore}
        >
          {busy ? t("settings.account.restore.busy") : t("settings.account.restore.button")}
        </button>
      </div>
    </div>
  );
}
