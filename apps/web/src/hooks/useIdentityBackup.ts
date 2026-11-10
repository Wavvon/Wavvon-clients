import { useEffect, useState } from "react";
import { loadIdentity } from "@identity/index";
import { identityNeedsBackup, wasBackupPrompted, markBackupPrompted } from "../utils/identityBackup";

/** An identity created from an invite link never met the phrase screen, so
 *  the only copy of its key is this browser's. That fact gets a marker on the
 *  settings gear until it stops being true, and one prompt at the first
 *  message — see utils/identityBackup.ts. Recomputed rather than watched:
 *  the two places that can change it are the settings panel and this prompt,
 *  and both close. */
export function useIdentityBackup(publicKey: string | null, showSettings: boolean) {
  const [backupNeeded, setBackupNeeded] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

  // Closing the settings panel is when revealing the phrase or exporting a
  // backup could have happened, and a fresh identity is the other moment the
  // answer changes.
  useEffect(() => {
    loadIdentity().then((rec) => setBackupNeeded(identityNeedsBackup(rec)));
  }, [publicKey, showSettings]);

  function handleOwnMessageSent() {
    if (wasBackupPrompted()) return;
    loadIdentity().then((rec) => {
      if (!identityNeedsBackup(rec) || wasBackupPrompted()) return;
      markBackupPrompted();
      setShowBackupPrompt(true);
    });
  }

  return { backupNeeded, showBackupPrompt, setShowBackupPrompt, handleOwnMessageSent };
}
