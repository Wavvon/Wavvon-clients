import { useTranslation } from "react-i18next";
import { CameraSection } from "../CameraSection";

export function CameraTab() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.camera")}</h1>
      <CameraSection />
    </section>
  );
}
