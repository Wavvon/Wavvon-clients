import React from "react";
import { useTranslation } from "react-i18next";
import { channelPath } from "@wavvon/core";
import type { Channel, Message, ActiveStream } from "../../types";
import { ScreenShareViewer } from "../ScreenShareViewer";
import type { ScreenShareViewerRef } from "../ScreenShareViewer";

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
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  onBreadcrumbCategoryClick: (categoryId: string) => void;
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
  onToast,
  onError,
  onBreadcrumbCategoryClick,
}: Props) {
  const { t } = useTranslation();
  const breadcrumb = channelPath(channels, selectedChannel.id);

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
        {!selectedChannel.is_category && (
          voiceChannelId === selectedChannel.id ? (
            <button
              onClick={onVoiceLeave}
              className="btn-voice-header btn-voice-leave"
              title={t("voice.leave")}
            >
              🔴 {t("voice.leave.header")}
            </button>
          ) : (
            <button
              onClick={onVoiceJoin}
              className="btn-voice-header btn-voice-join"
              title={t("voice.join")}
            >
              🎙 {t("voice.join.header")}
            </button>
          )
        )}
        {!selectedChannel.is_category && onStartShare && !sharing && (
          <button
            onClick={onStartShare}
            className="btn-icon-header"
            title={t("voice.screen_share")}
            aria-label={t("voice.screen_share")}
          >
            🖥
          </button>
        )}
        <button
          onClick={copyChannelLink}
          className="btn-icon-header"
          title={t("channel.ctx.copy_link")}
          aria-label={t("channel.ctx.copy_link")}
        >
          🔗
        </button>
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
      {sharing && (
        <div className="screen-share-active-bar">
          <span>{t("voice.sharing")}</span>
          {(shareKbps ?? 0) > 0 && (
            <span className="muted">{shareKbps} kbps</span>
          )}
          <button className="stop-btn" onClick={onStopShare}>
            {t("voice.screen_share.stop")}
          </button>
        </div>
      )}
    </>
  );
}
