import React from "react";

interface Props {
  reconnecting: boolean;
  onReconnect: () => void;
}

export function ReconnectBanner({ reconnecting, onReconnect }: Props) {
  return (
    <div className="reconnect-banner">
      <span>{reconnecting ? "Reconnecting…" : "Disconnected from hub."}</span>
      <button
        className="btn-small"
        onClick={onReconnect}
        disabled={!!reconnecting}
      >
        {reconnecting ? "Working…" : "Reconnect"}
      </button>
    </div>
  );
}
