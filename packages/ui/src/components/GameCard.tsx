import type { GameLaunchCard } from "@wavvon/core";

interface Props {
  game: GameLaunchCard;
  botId: string;
  channelId: string;
  onPlay: (botId: string, channelId: string) => void;
}

/** Renders a bot message's `game` field as a launch card (bot-capability-layer.md
 *  §2, §6 Phase 1 item 3). The Play button rejoins through the ordinary
 *  `bot_app_join` path -- same flow as the inline BotAppLaunchCard. */
export function GameCard({ game, botId, channelId, onPlay }: Props) {
  return (
    <div className="message-embeds">
      <div className="embed-card">
        <div className="embed-body">
          {game.thumbnail_url && <img className="embed-thumbnail" src={game.thumbnail_url} alt="" />}
          <div className="embed-main">
            <div className="embed-title">{game.name}</div>
            {game.description && <div className="embed-description">{game.description}</div>}
            <button className="btn-secondary" style={{ marginTop: "var(--space-2)" }} onClick={() => onPlay(botId, channelId)}>
              Play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
