import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { buildIdentityListing, type IdentityListingDoc } from "@wavvon/core";
import { FindableSection, type FindableActions } from "@wavvon/ui";

/** The invite-directory listing of this identity: the document is built here,
 *  the shell signs it with the master key and talks to the directory. */
export function FindableDirectorySection({ directoryUrl }: { directoryUrl: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ master: string | null; homeHub: string | null; paired: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<{ master_pubkey: string; hubs: string[] } | null>("get_home_hub_list").catch(() => null),
      invoke<unknown | null>("get_paired_identity").catch(() => null),
    ]).then(([list, paired]) => {
      if (!cancelled) setState({ master: list?.master_pubkey ?? null, homeHub: list?.hubs[0] ?? null, paired: !!paired });
    });
    return () => { cancelled = true; };
  }, []);

  if (!state) return null;

  const actions: FindableActions = {
    load: () => invoke<IdentityListingDoc | null>("directory_identity_get", { directoryUrl }),
    publish: (fields) => invoke<void>("directory_identity_publish", {
      directoryUrl,
      payload: buildIdentityListing(fields, state.master!, state.homeHub!, Math.floor(Date.now() / 1000)),
    }),
    unpublish: () => invoke<void>("directory_identity_unpublish", { directoryUrl }),
  };

  const disabledReason = state.paired
    ? t("findable.no_master")
    : !state.homeHub || !state.master ? t("findable.no_home_hub") : null;

  return <FindableSection actions={actions} homeHub={state.homeHub} disabledReason={disabledReason} />;
}
