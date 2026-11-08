import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { miniAppHost } from "@wavvon/core";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

interface Props {
  miniAppUrl: string;
  sessionToken: string;
  channelId: string;
  appId: string;
  hubUrl: string;
  title: string;
  requiresCamera?: boolean;
  onClose: () => void;
}

/** The mini-app webview promoted to a focus-taking modal
 *  (bot-capability-layer.md §2 "the game modal = mini-app, promoted").
 *  Same sandbox, same scoped token, same `app_open` wire shape as the
 *  inline launch panel -- only the presentation changes. */
export function GameModal({
  miniAppUrl,
  sessionToken,
  channelId,
  appId,
  hubUrl,
  title,
  requiresCamera,
  onClose,
}: Props) {
  useCloseOnEscape(onClose);
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // The context carries a session token. It goes to the app's own origin
    // only: a frame that has navigated elsewhere since (a redirect, a link)
    // gets nothing on its next `load`.
    let appOrigin: string;
    try {
      appOrigin = new URL(miniAppUrl, window.location.href).origin;
    } catch {
      return;
    }
    const onLoad = () => {
      iframe.contentWindow?.postMessage(
        {
          type: "wavvon_context",
          hub_url: hubUrl,
          token: sessionToken,
          channel_id: channelId,
          app_id: appId,
        },
        appOrigin,
      );
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [miniAppUrl, sessionToken, channelId, appId, hubUrl]);

  return (
    <div className="game-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="game-modal">
        <div className="game-modal-titlebar">
          <span className="game-modal-title">
            {title} <span className="muted">{miniAppHost(miniAppUrl)}</span>
          </span>
          <button className="game-modal-close" onClick={onClose} aria-label={t("modal.close")}>
            &#x2715;
          </button>
        </div>
        <iframe
          ref={iframeRef}
          src={miniAppUrl}
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow={requiresCamera ? "camera" : undefined}
          className="game-modal-frame"
          title={title}
        />
      </div>
    </div>
  );
}
