export type PassphraseStrength = "weak" | "fair" | "strong";

// Shared by every passphrase-protected export flow (identity backup, full
// archive, identity-creation backup) so the same input reads the same
// strength everywhere.
export function passphraseStrength(p: string): PassphraseStrength {
  if (p.length < 8) return "weak";
  if (p.length < 14) return "fair";
  return "strong";
}
