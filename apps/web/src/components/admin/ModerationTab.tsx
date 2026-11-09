import {
  ContentReportsSection,
  AutomodWebhookSection,
  FederatedBanlistSection,
  LockdownSection,
} from "@wavvon/ui";
import { activeHubSupports } from "@platform";
import { useTranslation } from "react-i18next";
import {
  listReports,
  reviewReport,
  getModerationSettings,
  patchModerationSettings,
  getBanlistSettings,
  getBanlistEntries,
  getBanlistOverrides,
  addBanlistSource,
  removeBanlistSource,
  updateBanlistSourcePolicy,
  addBanlistOverride,
  removeBanlistOverride,
  setBanlistPublish,
  getLockdown,
  putLockdown,
} from "../../platform/commands/moderation";

// Module-level: each section loads on mount, and a new object every render
// would reload it every render.
const contentReportActions = { listReports, reviewReport };
const automodActions = { getModerationSettings, patchModerationSettings };
const lockdownActions = { getLockdown, putLockdown };
const banlistActions = {
  getBanlistSettings,
  getBanlistEntries,
  getBanlistOverrides,
  addBanlistSource,
  removeBanlistSource,
  updateBanlistSourcePolicy,
  addBanlistOverride,
  removeBanlistOverride,
  setBanlistPublish,
};

export function ModerationTab() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("channel.settings.tab_moderation")}</h1>
      <p className="muted">{t("hub.admin.moderation.hint")}</p>
      {activeHubSupports("hub.lockdown") && <LockdownSection actions={lockdownActions} />}
      <ContentReportsSection actions={contentReportActions} />
      <AutomodWebhookSection actions={automodActions} />
      <FederatedBanlistSection actions={banlistActions} />
    </section>
  );
}
