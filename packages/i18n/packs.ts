import IntlMessageFormat from 'intl-messageformat';
import en from './en.json';

// Language packs (docs wiki language-packs.md §2): a pack can change every
// word of the interface, so the client filters what it takes from one,
// whatever the source (a file, the directory, a hub).

// Strings a pack never replaces: the recovery phrase, backups, key
// confirmation, device pairing, identity handover and security warnings.
// They always come from the official catalogue of the chosen language
// (English when there is none). Grows with the catalogues.
export const LOCKED_KEY_PREFIXES = [
  'identity_backup.',
  'identity_setup.backup.',
  'identity_setup.generated.',
  'identity_setup.pair.',
  'identity_setup.recover.',
  'settings.identity_backup',
  'settings.account.identity_backup.',
  'settings.account.full_archive.',
  'settings.account.restore.',
  'settings.account.devices.',
  'settings.account.passkeys.',
  'settings.devices.pairing',
  'settings.pairing.',
  'settings.security.',
  'recovery.',
  'handover.',
  'dm.encryption_warning',
  'dm.key_changed',
  'dm.own_message_other_device',
  'attachment.download_warning',
  'webhooks.secret_warning',
  'webhooks.regen_warning',
];

export function isLockedKey(key: string): boolean {
  return LOCKED_KEY_PREFIXES.some((p) => key.startsWith(p));
}

type IcuElement = { type: number; value?: unknown; options?: Record<string, { value: IcuElement[] }> };
function collectArgs(elements: IcuElement[], into: Set<string>) {
  for (const el of elements) {
    if (el.type === 0 || el.type === 7) continue; // literal, `#`
    if (typeof el.value === 'string') into.add(el.value);
    for (const option of Object.values(el.options ?? {})) collectArgs(option.value, into);
    if (Array.isArray(el.value)) collectArgs(el.value as IcuElement[], into); // tag children
  }
}

/** The argument and tag names of an ICU message, sorted and joined; null when
 *  it does not parse. From the parsed message, not a regex: inside
 *  `{count, plural, one {# reply}}` the branch bodies are messages, and a
 *  regex reads their first word as an argument name. */
export function argNames(message: string, locale: string): string | null {
  const found = new Set<string>();
  try {
    collectArgs(new IntlMessageFormat(message, locale).getAst() as IcuElement[], found);
  } catch {
    return null;
  }
  return [...found].sort().join(',');
}

const english = en as Record<string, string>;

/** The keys a pack may translate: every English key that is not metadata
 *  (`_dir`) and not locked. */
export const TRANSLATABLE_KEYS = Object.keys(english).filter((k) => !k.startsWith('_') && !isLockedKey(k));

/** What the client takes from a pack: known, unlocked keys whose value parses
 *  as ICU with exactly the English arguments. Everything else falls back. */
export function sanitizePackStrings(strings: Record<string, string>, locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TRANSLATABLE_KEYS) {
    const value = strings[key];
    if (typeof value !== 'string') continue;
    const args = argNames(value, locale);
    if (args !== null && args === argNames(english[key], 'en')) out[key] = value;
  }
  return out;
}

/** Share of the translatable keys a sanitized pack carries, 0 to 1. */
export function packCoverage(sanitized: Record<string, string>): number {
  return Object.keys(sanitized).length / TRANSLATABLE_KEYS.length;
}
