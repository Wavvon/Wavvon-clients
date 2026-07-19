import { useEffect, useRef } from "react";

interface Props {
  miniAppUrl: string;
  sessionToken: string;
  channelId: string;
  botId: string;
  hubUrl: string;
  title: string;
  requiresCamera?: boolean;
  onClose: () => void;
}

/** The mini-app webview promoted to a focus-taking modal
 *  (bot-capability-layer.md §2 "the game modal = mini-app, promoted").
 *  Same sandbox, same scoped token, same `bot_app_open` wire shape as the
 *  inline launch panel -- only the presentation changes. */
export function GameModal({
  miniAppUrl,
  sessionToken,
  channelId,
  botId,
  hubUrl,
  title,
  requiresCamera,
  onClose,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      iframe.contentWindow?.postMessage(
        {
          type: "wavvon_context",
          hub_url: hubUrl,
          token: sessionToken,
          channel_id: channelId,
          bot_id: botId,
        },
        "*",
      );
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [miniAppUrl, sessionToken, channelId, botId, hubUrl]);

  return (
    <div className="game-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="game-modal">
        <div className="game-modal-titlebar">
          <span className="game-modal-title">{title}</span>
          <button className="game-modal-close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>
        <iframe
          ref={iframeRef}
          src={miniAppUrl}
          sandbox={`allow-scripts allow-same-origin allow-forms${requiresCamera ? " allow-camera" : ""}`}
          className="game-modal-frame"
          title={title}
        />
      </div>
    </div>
  );
}
