import React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  reconnecting: boolean;
  onReconnect: () => void;
}

export function ReconnectBanner({ reconnecting, onReconnect }: Props) {
  const { t } = useTranslation();
  return (
    <div className="reconnect-banner">
      <span>{reconnecting ? t("reconnect.reconnecting") : t("reconnect.disconnected")}</span>
      <button
        className="btn-small"
        onClick={onReconnect}
        disabled={!!reconnecting}
      >
        {reconnecting ? t("reconnect.working") : t("reconnect.button")}
      </button>
    </div>
  );
}
