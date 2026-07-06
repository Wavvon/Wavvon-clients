import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

// 32-byte seed hex → 24-word BIP39 mnemonic (256-bit entropy + 8-bit checksum).
// Same wordlist and entropy format as the desktop's wavvon_identity crate.
export function seedToPhrase(seedHex: string): string {
  if (seedHex.length !== 64) throw new Error("Expected 32-byte (64-char) seed hex");
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    entropy[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bip39.entropyToMnemonic(entropy, wordlist);
}

// 24-word BIP39 mnemonic → 32-byte seed hex.
export function phraseToSeed(phrase: string): string {
  const entropy = bip39.mnemonicToEntropy(phrase.trim(), wordlist);
  if (entropy.length !== 32) throw new Error("Phrase did not decode to a 32-byte seed");
  return Array.from(entropy, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validatePhrase(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim(), wordlist);
}
