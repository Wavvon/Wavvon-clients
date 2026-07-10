import React from "react";
import type { BotAppLaunchEvent } from "@shared/types";

interface Props {
  event: BotAppLaunchEvent;
  onJoin: (botId: string, channelId: string) => void;
}

export function BotAppLaunchCard({ event, onJoin }: Props) {
  return (
    <div className="embed-card bot-app-launch-card">
      <div className="embed-title">{event.title}</div>
      <div className="embed-description">{event.description}</div>
      <button
        className="btn-secondary"
        onClick={() => onJoin(event.bot_id, event.channel_id)}
      >
        Join
      </button>
    </div>
  );
}
