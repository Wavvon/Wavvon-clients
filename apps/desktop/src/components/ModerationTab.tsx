import { useTranslation } from "react-i18next";
import {
  ContentReportsSection,
  AutomodWebhookSection,
  FederatedBanlistSection,
  LockdownSection,
} from "@wavvon/ui";
import { contentReportActions, automodActions, banlistActions, lockdownActions } from "../hooks/hubAdminActions";

/** Desktop's moderation tab. Web has had one since the moderation suite
 *  shipped; desktop had no surface for any of it, so a moderator here could
 *  not see what members had flagged.
 *
 *  Reports, the automod webhook and federated ban lists. The
 *  outgoing-webhook manager is here too, in its own admin tab rather than
 *  this one — same place web keeps it. */
export function ModerationTab({ lockdown = false }: { lockdown?: boolean }) {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("channel.settings.tab_moderation")}</h1>
      {lockdown && <LockdownSection actions={lockdownActions} />}
      <ContentReportsSection actions={contentReportActions} />
      <AutomodWebhookSection actions={automodActions} />
      <FederatedBanlistSection actions={banlistActions} />
    </section>
  );
}
