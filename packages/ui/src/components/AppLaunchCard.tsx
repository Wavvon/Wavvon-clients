import type { AppLaunchEvent } from "../types";
import { useTranslation } from "react-i18next";

interface Props {
  event: AppLaunchEvent;
  onJoin: (appId: string, channelId: string) => void;
}

export function AppLaunchCard({ event, onJoin }: Props) {
  const { t } = useTranslation();
  return (
    <div className="embed-card app-launch-card">
      <div className="embed-title">{event.title}</div>
      <div className="embed-description">{event.description}</div>
      <button
        className="btn-secondary"
        onClick={() => onJoin(event.app_id, event.channel_id)}
      >
        {t("app.join")}
      </button>
    </div>
  );
}
