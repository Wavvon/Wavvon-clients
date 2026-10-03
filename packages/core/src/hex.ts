// `@noble/hashes` is already a direct dependency of this package and exports
// both of these under the same names, so the hand-written pair here was twelve
// lines reinventing it (Wavvon-clients#61).
//
// One behaviour change, in the safe direction: noble **throws** on non-hex
// input and on an odd length, where the old `hexToBytes` ran `parseInt` per
// pair and silently produced `NaN` bytes. Every caller is a crypto or identity
// path — key material, signatures, DM envelopes — and there a wrong byte is a
// failure either way, just a quieter one. Noble also accepts uppercase, which
// the old one did too.
export { bytesToHex, hexToBytes } from "@noble/hashes/utils";
