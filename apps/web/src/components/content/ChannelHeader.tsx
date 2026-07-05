import React from "react";
import { useTranslation } from "react-i18next";
import { channelPath } from "@wavvon/core";
import type { Channel, Message, ActiveStream, SoundboardClip } from "../../types";
import { ScreenShareViewer } from "../ScreenShareViewer";
import type { ScreenShareViewerRef } from "../ScreenShareViewer";
import { VideoGrid } from "../VideoGrid";
import { SoundboardPopover } from "../SoundboardPopover";
import {
  PhoneIcon, PhoneOffIcon, MicOnIcon, MicOffIcon, DeafenIcon,
  ScreenShareIcon, CameraOnIcon, CameraOffIcon,
} from "../Icons";

interface Props {
  selectedChannel: Channel;
  channels: Channel[];
  activeHubUrl?: string;
  voiceChannelId?: string | null;
  memberSidebarHidden: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: Message[] | null;
  activeScreenShares: ActiveStream[];
  screenShareViewerRef: React.RefObject<ScreenShareViewerRef | null>;
  sharing?: boolean;
  shareKbps?: number;
  isAdmin: boolean;
  onVoiceJoin?: () => void;
  onVoiceLeave?: () => void;
  onShowPinned: () => void;
  onToggleSearch: () => void;
  onCloseSearch: () => void;
  onSetSearchQuery: (v: string) => void;
  onToggleMemberSidebar: () => void;
  onOpenEditDescription: (channel: Channel) => void;
  onStartShare?: () => void;
  onStopShare?: () => void;
  videoEnabled?: boolean;
  localVideoStream?: MediaStream | null;
  remoteVideoStreams?: Map<string, MediaStream>;
  onToggleVideo?: () => void;
  videoNameFor?: (pubkey: string) => string;
  onOpenHubStreams?: () => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  onBreadcrumbCategoryClick: (categoryId: string) => void;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  onToggleSelfMute?: () => void;
  onToggleSelfDeafen?: () => void;
  canUseSoundboard?: boolean;
  onTriggerSoundboardClip?: (clip: SoundboardClip) => void;
  soundboardPlayingClipId?: string | null;
}

export function ChannelHeader({
  selectedChannel,
  channels,
  activeHubUrl,
  voiceChannelId,
  memberSidebarHidden,
  searchOpen,
  searchQuery,
  searchResults,
  activeScreenShares,
  screenShareViewerRef,
  sharing,
  shareKbps,
  isAdmin,
  onVoiceJoin,
  onVoiceLeave,
  onShowPinned,
  onToggleSearch,
  onCloseSearch,
  onSetSearchQuery,
  onToggleMemberSidebar,
  onOpenEditDescription,
  onStartShare,
  onStopShare,
  videoEnabled,
  localVideoStream,
  remoteVideoStreams,
  onToggleVideo,
  videoNameFor,
  onOpenHubStreams,
  onToast,
  onError,
  onBreadcrumbCategoryClick,
  selfMuted,
  selfDeafened,
  onToggleSelfMute,
  onToggleSelfDeafen,
  canUseSoundboard,
  onTriggerSoundboardClip,
  soundboardPlayingClipId,
}: Props) {
  const { t } = useTranslation();
  const breadcrumb = channelPath(channels, selectedChannel.id);
  const inVoice = voiceChannelId === selectedChannel.id;

  async function copyChannelLink() {
    if (!activeHubUrl) return;
    const link = `wavvon://${activeHubUrl.replace(/^https?:\/\//, "")}/channel/${selectedChannel.id}`;
    try {
      await navigator.clipboard.writeText(link);
      onToast(t("message.action.link_copied"));
    } catch (e) {
      onError(String(e));
    }
  }

  return (
    <>
      <div className="channel-header">
        <div className="channel-header-info">
          {breadcrumb.length > 1 && (
            <nav className="channel-breadcrumb" aria-label={t("channel.breadcrumb.aria")}>
              {breadcrumb.slice(0, -1).map((crumb) => (
                <React.Fragment key={crumb.id}>
                  <button
                    type="button"
                    className="channel-breadcrumb-item"
                    onClick={() => onBreadcrumbCategoryClick(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                  <span className="channel-breadcrumb-sep" aria-hidden="true">›</span>
                </React.Fragment>
              ))}
              <span className="channel-breadcrumb-item current"># {selectedChannel.name}</span>
            </nav>
          )}
          <h3># {selectedChannel.name}</h3>
          {selectedChannel.description ? (
            <p
              className={`channel-description ${isAdmin ? "editable" : ""}`}
              onClick={() => { if (isAdmin) onOpenEditDescription(selectedChannel); }}
              title={isAdmin ? t("channel.description.click_edit") : undefined}
            >
              {selectedChannel.description}
            </p>
          ) : isAdmin ? (
            <p
              className="channel-description editable muted"
              onClick={() => onOpenEditDescription(selectedChannel)}
              title={t("channel.description.click_add")}
            >
              {t("channel.add_description")}
            </p>
          ) : null}
        </div>
        <button
          onClick={copyChannelLink}
          className="btn-icon-header"
          title={t("channel.ctx.copy_link")}
          aria-label={t("channel.ctx.copy_link")}
        >
          🔗
        </button>
        {onOpenHubStreams && (
          <button
            onClick={onOpenHubStreams}
            className="btn-icon-header"
            title="Live screen shares"
            aria-label="Live screen shares"
          >
            📡
          </button>
        )}
        <button
          onClick={onShowPinned}
          className="btn-icon-header"
          title="Pinned messages"
        >
          📌
        </button>
        <button
          onClick={onToggleSearch}
          className="btn-icon-header"
          title={t("content.search.title")}
        >
          🔍
        </button>
        <button
          onClick={onToggleMemberSidebar}
          className="btn-icon-header"
          title={memberSidebarHidden ? t("content.members.show") : t("content.members.hide")}
        >
          {memberSidebarHidden ? "👥" : "👤"}
        </button>
      </div>

      {!selectedChannel.is_category && (
        <div className="channel-voice-row">
          {!inVoice ? (
            <button
              onClick={onVoiceJoin}
              className="btn-voice-header btn-voice-join"
              title={t("voice.join")}
            >
              <PhoneIcon />
              {t("voice.join.header")}
            </button>
          ) : (
            <>
              {onToggleSelfMute && (
                <button
                  onClick={onToggleSelfMute}
                  className={`btn-icon-gear ${selfMuted ? "active" : ""}`}
                  aria-pressed={selfMuted}
                  aria-label={selfMuted ? t("voice.unmute") : t("voice.mute")}
                  title={selfMuted ? t("voice.unmute.short") : t("voice.mute.short")}
                >
                  {selfMuted ? <MicOffIcon /> : <MicOnIcon />}
                </button>
              )}
              {onToggleSelfDeafen && (
                <button
                  onClick={onToggleSelfDeafen}
                  className={`btn-icon-gear ${selfDeafened ? "active" : ""}`}
                  aria-pressed={selfDeafened}
                  aria-label={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                  title={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                >
                  <DeafenIcon muted={selfDeafened} />
                </button>
              )}
              {canUseSoundboard && onTriggerSoundboardClip && (
                <SoundboardPopover
                  onTrigger={onTriggerSoundboardClip}
                  playingClipId={soundboardPlayingClipId ?? null}
                />
              )}
              {onStartShare && onStopShare && (
                <>
                  <button
                    onClick={sharing ? onStopShare : onStartShare}
                    className={`btn-icon-gear ${sharing ? "active" : ""}`}
                    title={sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                    aria-label={sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                  >
                    <ScreenShareIcon />
                  </button>
                  {sharing && (shareKbps ?? 0) > 0 && (
                    <span className="muted channel-voice-row-kbps">{shareKbps} kbps</span>
                  )}
                </>
              )}
              {onToggleVideo && (
                <button
                  onClick={onToggleVideo}
                  className={`btn-icon-gear ${videoEnabled ? "active" : ""}`}
                  title={videoEnabled ? t("voice.camera.off") : t("voice.camera.on")}
                  aria-label={videoEnabled ? t("voice.camera.off") : t("voice.camera.on")}
                >
                  {videoEnabled ? <CameraOnIcon /> : <CameraOffIcon />}
                </button>
              )}
              <button
                onClick={onVoiceLeave}
                className="btn-icon-gear voice-call-btn end"
                title={t("voice.leave")}
                aria-label={t("voice.leave")}
              >
                <PhoneOffIcon />
              </button>
            </>
          )}
        </div>
      )}

      {searchOpen && (
        <div className="search-bar">
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onCloseSearch(); }}
            placeholder={t("channel.search.placeholder", { channel: selectedChannel.name })}
          />
          {searchResults !== null && (
            <span className="muted search-count">
              {t("channel.search.count", { count: searchResults.length })}
            </span>
          )}
          <button onClick={onCloseSearch} className="btn-small">{t("channel.search.close")}</button>
        </div>
      )}
      {activeScreenShares.length > 0 && (
        <ScreenShareViewer
          ref={screenShareViewerRef}
          streams={activeScreenShares}
        />
      )}
      {(videoEnabled || (remoteVideoStreams && remoteVideoStreams.size > 0)) && (
        <VideoGrid
          localStream={localVideoStream ?? null}
          remoteStreams={remoteVideoStreams ?? new Map()}
          nameFor={videoNameFor ?? ((pk) => pk.slice(0, 8))}
        />
      )}
    </>
  );
}
