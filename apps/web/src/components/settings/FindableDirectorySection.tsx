import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildIdentityListing, identityDeleteMessage, signDirectoryMessage, type IdentityListingDoc,
} from "@wavvon/core";
import { FindableSection, type FindableActions } from "@wavvon/ui";
import { holdsMasterSeed, masterPubkeyOf, masterSeedHex, type IdentityRecord } from "@identity/index";
import { fetchWithTimeout, getHomeHubDesignation } from "@platform";

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? `HTTP ${res.status}`);
}

/** The invite-directory listing of `account`, signed with its master key and
 *  routed to its first home hub. */
export function FindableDirectorySection({ account, directoryUrl }: { account: IdentityRecord; directoryUrl: string }) {
  const { t } = useTranslation();
  const pubkey = useMemo(() => masterPubkeyOf(account), [account]);
  const holdsMaster = holdsMasterSeed(account);
  const [homeHub, setHomeHub] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getHomeHubDesignation(pubkey)
      .then((d) => { if (!cancelled) setHomeHub(d?.hubs[0] ?? null); })
      .catch(() => { if (!cancelled) setHomeHub(null); });
    return () => { cancelled = true; };
  }, [pubkey]);

  if (homeHub === undefined) return null;
  const base = directoryUrl.replace(/\/+$/, "");
  const url = `${base}/api/identities/${pubkey}`;

  const load = async (): Promise<IdentityListingDoc | null> => {
    const res = await fetchWithTimeout(url);
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res);
    return ((await res.json()) as { doc: IdentityListingDoc }).doc;
  };

  const actions: FindableActions = {
    load,
    publish: async (fields) => {
      const payload = buildIdentityListing(fields, pubkey, homeHub!, Math.floor(Date.now() / 1000));
      const sig = signDirectoryMessage(payload, masterSeedHex(account.seed_hex));
      // No JSON content type: the directory parses the body either way, and a
      // plain-text POST is a simple request a browser sends without a preflight.
      const res = await fetchWithTimeout(`${base}/api/identities`, {
        method: "POST",
        body: JSON.stringify({ payload, sig }),
      });
      if (!res.ok) throw await failure(res);
    },
    unpublish: async () => {
      const current = await load();
      if (!current) return;
      const sig = signDirectoryMessage(identityDeleteMessage(pubkey, current.listed_at), masterSeedHex(account.seed_hex));
      const res = await fetchWithTimeout(url, { method: "DELETE", headers: { "x-wavvon-signature": sig } });
      if (!res.ok && res.status !== 404) throw await failure(res);
    },
  };

  const disabledReason = !holdsMaster
    ? t("findable.no_master")
    : !homeHub ? t("findable.no_home_hub") : null;

  return <FindableSection key={pubkey} actions={actions} homeHub={homeHub} disabledReason={disabledReason} />;
}
