import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BlockEntry } from "@shared/types";
import { BlockedUsersSection } from "@wavvon/ui";
import { hubFetchAs, isNotMemberError } from "@platform";
import { getActiveAccountId, type IdentityRecord } from "@identity/index";

interface Props {
  account: IdentityRecord;
  // The active account's blocked list lives in App state (they also
  // drive live message filtering there) — passed straight through when the
  // selected account IS the active one, so nothing about that path changes.
  activeBlocks: BlockEntry[];
  onUnblockActive: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

// Managing a non-active account's blocked users (AccountTab's
// "Managing" selector) fetches and mutates its own copy — dm-blocks via
// hubFetchAs (session-bound, see platform/hubFetchAs.ts).
export function AccountBlockedUsersSection({
  account,
  activeBlocks,
  onUnblockActive,
  knownNames,
}: Props) {
  const { t } = useTranslation();
  const isActive = account.id === getActiveAccountId();
  const label = account.account_label ?? null;
  const [remoteBlocks, setRemoteBlocks] = useState<string[] | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isActive) return;
    let cancelled = false;
    setRemoteBlocks(null);
    setNotMember(false);
    setError(null);
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

  if (isActive) {
    return (
      <BlockedUsersSection
        blocks={activeBlocks}
        onUnblock={onUnblockActive}
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
      <BlockedUsersSection
        blocks={(remoteBlocks ?? []).map((p) => ({ pubkey: p, since: 0 }))}
        onUnblock={unblockRemote}
        knownNames={knownNames}
        accountLabel={label}
      />
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </>
  );
}
