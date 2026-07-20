import React from "react";
import { useTranslation } from "react-i18next";
import { channelPath } from "@wavvon/core";
import type { Channel } from "@wavvon/core";
import type { Message } from "../../types";

interface Props {
  selectedChannel: Channel;
  channels: Channel[];
  memberSidebarHidden: boolean;
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
  onBreadcrumbCategoryClick: (categoryId: string) => void;
}

export function ChannelHeader({
  selectedChannel,
  channels,
  memberSidebarHidden,
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
  onBreadcrumbCategoryClick,
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
