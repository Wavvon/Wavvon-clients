import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BlockEntry, IgnoreEntry } from "@shared/types";
import { getScoped, setScoped } from "@shared/utils/accountScope";
import { BlockIgnoreSection } from "@wavvon/ui";
import { hubFetchAs, isNotMemberError } from "@platform";
import { getActiveAccountId, type IdentityRecord } from "@identity/index";

const IGNORED_KEY = "wavvon.ignoredUsers";

interface Props {
  account: IdentityRecord;
  // The active account's blocked/ignored lists live in App state (they also
  // drive live message filtering there) — passed straight through when the
  // selected account IS the active one, so nothing about that path changes.
  activeBlocks: BlockEntry[];
  activeIgnores: IgnoreEntry[];
  onUnblockActive: (pubkey: string) => void;
  onUnignoreActive: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

// Managing a non-active account's blocked/ignored users (AccountTab's
// "Managing" selector) fetches and mutates its own copy — dm-blocks via
// hubFetchAs (session-bound, see platform/hubFetchAs.ts), ignores via that
// account's own namespaced localStorage (local-only, no hub call).
export function AccountBlockIgnoreSection({
  account,
  activeBlocks,
  activeIgnores,
  onUnblockActive,
  onUnignoreActive,
  knownNames,
}: Props) {
  const { t } = useTranslation();
  const isActive = account.id === getActiveAccountId();
  const label = account.account_label ?? null;
  const [remoteBlocks, setRemoteBlocks] = useState<string[] | null>(null);
  const [remoteIgnores, setRemoteIgnores] = useState<string[]>([]);
  const [notMember, setNotMember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isActive) return;
    let cancelled = false;
    setRemoteBlocks(null);
    setNotMember(false);
    setError(null);
    try {
      const raw = getScoped(IGNORED_KEY, account.id);
      setRemoteIgnores(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRemoteIgnores([]);
    }
    (async () => {
      try {
        const res = await hubFetchAs(account, "/identity/dm-blocks");
        const body = (await res.json()) as { pubkeys: string[] };
        if (!cancelled) setRemoteBlocks(body.pubkeys);
      } catch (e) {
        if (cancelled) return;
        if (isNotMemberError(e)) setNotMember(true);
        else setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, isActive]);

  async function unblockRemote(pubkey: string) {
    if (!remoteBlocks) return;
    const prev = remoteBlocks;
    const next = remoteBlocks.filter((p) => p !== pubkey);
    setRemoteBlocks(next);
    try {
      await hubFetchAs(account, "/identity/dm-blocks", {
        method: "PUT",
        body: JSON.stringify({ pubkeys: next }),
      });
    } catch (e) {
      setRemoteBlocks(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function unignoreRemote(pubkey: string) {
    const next = remoteIgnores.filter((p) => p !== pubkey);
    setRemoteIgnores(next);
    setScoped(IGNORED_KEY, JSON.stringify(next), account.id);
  }

  if (isActive) {
    return (
      <BlockIgnoreSection
        blocks={activeBlocks}
        ignores={activeIgnores}
        onUnblock={onUnblockActive}
        onUnignore={onUnignoreActive}
        knownNames={knownNames}
        accountLabel={label}
      />
    );
  }

  if (notMember) {
    return (
      <div className="settings-section">
        <label className="settings-label">{t("settings.account.blocked_users.label", { count: 0 })}</label>
        <p className="muted">
          {t("settings.account.not_member_notice", { label: label ?? t("settings.account.this_account_label") })}
        </p>
      </div>
    );
  }

  return (
    <>
      <BlockIgnoreSection
        blocks={(remoteBlocks ?? []).map((p) => ({ pubkey: p, since: 0 }))}
        ignores={remoteIgnores.map((p) => ({ pubkey: p, since: 0 }))}
        onUnblock={unblockRemote}
        onUnignore={unignoreRemote}
        knownNames={knownNames}
        accountLabel={label}
      />
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </>
  );
}
