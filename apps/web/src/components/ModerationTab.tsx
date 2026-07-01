import { ContentReportsSection } from "./ContentReportsSection";
import { AutomodWebhookSection } from "./AutomodWebhookSection";
import { FederatedBanlistSection } from "./FederatedBanlistSection";

export function ModerationTab() {
  return (
    <section>
      <h1>Moderation</h1>
      <ContentReportsSection />
      <AutomodWebhookSection />
      <FederatedBanlistSection />
    </section>
  );
}
