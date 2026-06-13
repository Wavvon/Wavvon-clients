import { useState } from "react";

export function RestoreIdentitySection({
  onRestore,
}: {
  onRestore: (phrase: string) => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
  const looksValid = wordCount === 24;

  async function handleRestore() {
    if (!looksValid) return;
    const ok = confirm(
      "Restore identity from this phrase?\n\nYour current keypair will be replaced and every saved hub will be removed. You'll re-add hubs under the restored identity.",
    );
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
      <label className="settings-label">Restore from recovery phrase</label>
      <p className="muted">
        Paste a 24-word phrase to replace this device's identity. Existing
        hubs and sessions will be cleared.
      </p>
      <textarea
        className="recovery-input"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="word1 word2 word3 …"
        rows={3}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <div className="recovery-input-footer">
        <span className="muted">{wordCount}/24 words</span>
        <button
          className="btn-secondary"
          disabled={!looksValid || busy}
          onClick={handleRestore}
        >
          {busy ? "Restoring…" : "Restore identity"}
        </button>
      </div>
    </div>
  );
}
