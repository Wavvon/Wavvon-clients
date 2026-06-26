import React, { useRef, useEffect } from "react";
import type { BotAppOpenEvent } from "../types";

interface Props {
  event: BotAppOpenEvent;
  hubUrl: string;
  onClose: () => void;
}

export function BotMiniAppFrame({ event, hubUrl, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      iframe.contentWindow?.postMessage({
        type: 'voxply_context',
        hub_url: hubUrl,
        token: event.session_token,
        channel_id: event.channel_id,
        bot_id: event.bot_id,
      }, '*');
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [event, hubUrl]);

  return (
    <div className="bot-mini-app-overlay">
      <div className="bot-mini-app-header">
        <button onClick={onClose}>&#x2715;</button>
      </div>
      <iframe
        ref={iframeRef}
        src={event.mini_app_url}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Bot Mini App"
      />
    </div>
  );
}
