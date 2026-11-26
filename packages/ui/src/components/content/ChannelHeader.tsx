import React from "react";
import { useTranslation } from "react-i18next";
import { channelPath } from "@wavvon/core";
import type { Channel } from "@wavvon/core";
import type { Message } from "../../types";
import { PinIcon, SearchIcon, MembersIcon, ScreenShareIcon, ChannelIcon, CalendarIcon } from "../Icons";

interface Props {
  selectedChannel: Channel;
  channels: Channel[];
  memberSidebarHidden: boolean;
  /** Live connection readout, supplied by the app (this package is
   *  network-free, so it cannot measure anything itself). */
  connectionStatus?: React.ReactNode;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: Message[] | null;
  isAdmin: boolean;
  onShowPinned: () => void;
  onToggleSearch: () => void;
  onCloseSearch: () => void;
  onSetSearchQuery: (v: string) => void;
  onToggleMemberSidebar: () => void;
  onOpenEditDescription: (channel: Channel) => void;
  /** Renders the "live screen shares" header button when the caller has
   * somewhere to send it — omit to hide the button entirely. */
  onOpenHubStreams?: () => void;
  /** Screen shares live on the hub; shown on the icon when above zero. */
  liveShareCount?: number;
  onBreadcrumbCategoryClick: (categoryId: string) => void;
  /** Opens the channel's events. */
  onOpenEvents?: () => void;
}

export function ChannelHeader({
  selectedChannel,
  channels,
  memberSidebarHidden,
  connectionStatus,
  searchOpen,
  searchQuery,
  searchResults,
  isAdmin,
  onShowPinned,
  onToggleSearch,
  onCloseSearch,
  onSetSearchQuery,
  onToggleMemberSidebar,
  onOpenEditDescription,
  onOpenHubStreams,
  liveShareCount = 0,
  onBreadcrumbCategoryClick,
  onOpenEvents,
}: Props) {
  const { t } = useTranslation();
  const breadcrumb = channelPath(channels, selectedChannel.id);

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
              <span className="channel-breadcrumb-item current"><ChannelIcon icon={selectedChannel.icon ?? null} customIconSvg={selectedChannel.custom_icon_svg ?? null} channelType={selectedChannel.channel_type} /> {selectedChannel.name}</span>
            </nav>
          )}
          <h1 className="channel-header-title">
            {/* The sidebar's icon for this channel's type, not a "#" for every kind. */}
            <ChannelIcon icon={selectedChannel.icon ?? null} customIconSvg={selectedChannel.custom_icon_svg ?? null} channelType={selectedChannel.channel_type} /> {selectedChannel.name}
            {selectedChannel.nsfw && (
              <span className="channel-temp-badge" style={{ marginLeft: 8 }} title={t("channel.sidebar.nsfw_badge")}>NSFW</span>
            )}
          </h1>
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
        {connectionStatus}
        {onOpenHubStreams && liveShareCount > 0 && (
          <button
            onClick={onOpenHubStreams}
            className="btn-icon-header"
            title={t("content.streams.title")}
            aria-label={
              liveShareCount > 0
                ? t("content.streams.title_live", { count: liveShareCount })
                : t("content.streams.title")
            }
          >
            <ScreenShareIcon />
            {liveShareCount > 0 && <span className="hub-unread-pill">{liveShareCount}</span>}
          </button>
        )}
        <button
          onClick={onShowPinned}
          className="btn-icon-header"
          title={t("content.pinned.title")}
          aria-label={t("content.pinned.title")}
        >
          <PinIcon size={18} />
        </button>
        {onOpenEvents && (
          <button
            onClick={onOpenEvents}
            className="btn-icon-header"
            title={t("events.open_panel")}
            aria-label={t("events.open_panel")}
          >
            <CalendarIcon size={18} />
          </button>
        )}
        <button
          onClick={onToggleSearch}
          className={`btn-icon-header${searchOpen ? " active" : ""}`}
          title={t("content.search.title")}
          aria-label={t("content.search.title")}
        >
          <SearchIcon size={18} />
        </button>
        <button
          onClick={onToggleMemberSidebar}
          className={`btn-icon-header${memberSidebarHidden ? "" : " active"}`}
          title={memberSidebarHidden ? t("content.members.show") : t("content.members.hide")}
          aria-label={memberSidebarHidden ? t("content.members.show") : t("content.members.hide")}
        >
          <MembersIcon size={18} />
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
    </>
  );
}
