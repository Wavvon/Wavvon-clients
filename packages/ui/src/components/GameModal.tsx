import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  checkSetVoicePosition,
  isFromFrame,
  isSetVoicePosition,
  miniAppHost,
  voiceRefusedMessage,
  voiceStateMessage,
  type VoiceBridgeState,
} from "@wavvon/core";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

/** Lets the frame move its own user in voice; omitted where the client has no
 *  proximity voice to move. */
export interface MiniAppVoiceBridge {
  state: VoiceBridgeState;
  onSetPosition: (zoneId: string, position: number[]) => void;
}

interface Props {
  miniAppUrl: string;
  sessionToken: string;
  channelId: string;
  appId: string;
  hubUrl: string;
  title: string;
  requiresCamera?: boolean;
  voice?: MiniAppVoiceBridge;
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
  voice,
  onClose,
}: Props) {
  useCloseOnEscape(onClose);
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const frameLoadedRef = useRef(false);

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
    const focusFrame = () => iframe.focus();
    focusFrame();
    window.addEventListener("focus", focusFrame);
    const postToFrame = (message: object) => iframe.contentWindow?.postMessage(message, appOrigin);
    const onMessage = (event: MessageEvent) => {
      if (!isFromFrame(event, iframe.contentWindow, appOrigin)) return;
      const bridge = voiceRef.current;
      if (!bridge) return;
      if (isSetVoicePosition(event.data)) {
        const r = checkSetVoicePosition(event.data, bridge.state);
        if (r.ok) bridge.onSetPosition(r.zoneId, r.position);
        else postToFrame(voiceRefusedMessage(r.reason));
      } else if (typeof (event.data as { type?: unknown } | null)?.type === "string"
        && (event.data as { type: string }).type.startsWith("wavvon:")) {
        console.warn(event.data);
      }
    };
    window.addEventListener("message", onMessage);
    const onLoad = () => {
      focusFrame();
      frameLoadedRef.current = true;
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
      if (voiceRef.current) postToFrame(voiceStateMessage(voiceRef.current.state));
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
      frameLoadedRef.current = false;
      window.removeEventListener("focus", focusFrame);
    };
  }, [miniAppUrl, sessionToken, channelId, appId, hubUrl]);

  const stateKey = voice ? JSON.stringify(voice.state) : "";
  useEffect(() => {
    if (!voiceRef.current || !frameLoadedRef.current) return;
    let appOrigin: string;
    try {
      appOrigin = new URL(miniAppUrl, window.location.href).origin;
    } catch {
      return;
    }
    iframeRef.current?.contentWindow?.postMessage(voiceStateMessage(voiceRef.current.state), appOrigin);
  }, [stateKey, miniAppUrl]);

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
