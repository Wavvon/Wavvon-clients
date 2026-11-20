import { useTranslation } from "react-i18next";
import { TrustedIssuersSection } from "./TrustedIssuersSection";

type Props = Parameters<typeof TrustedIssuersSection>[0];

// Trusted issuers sit with the badges they vouch for, in the Profile area.
export function TrustedIssuersTab(props: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("settings.privacy.trusted_issuers.label")}</h1>
      <TrustedIssuersSection {...props} />
    </section>
  );
}
