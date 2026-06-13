import React from "react";
import type { Channel, Message, ActiveStream } from "../../types";
import { ScreenShareViewer } from "../ScreenShareViewer";
import type { ScreenShareViewerRef } from "../ScreenShareViewer";

interface Props {
  selectedChannel: Channel;
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
  onToggleSearch: () => void;
  onCloseSearch: () => void;
  onSetSearchQuery: (v: string) => void;
  onToggleMemberSidebar: () => void;
  onOpenEditDescription: (channel: Channel) => void;
  onStopShare?: () => void;
}

export function ChannelHeader({
  selectedChannel,
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
  onToggleSearch,
  onCloseSearch,
  onSetSearchQuery,
  onToggleMemberSidebar,
  onOpenEditDescription,
  onStopShare,
}: Props) {
  return (
    <>
      <div className="channel-header">
        <div className="channel-header-info">
          <h3># {selectedChannel.name}</h3>
          {selectedChannel.description ? (
            <p
              className={`channel-description ${isAdmin ? "editable" : ""}`}
              onClick={() => { if (isAdmin) onOpenEditDescription(selectedChannel); }}
              title={isAdmin ? "Click to edit" : undefined}
            >
              {selectedChannel.description}
            </p>
          ) : isAdmin ? (
            <p
              className="channel-description editable muted"
              onClick={() => onOpenEditDescription(selectedChannel)}
              title="Click to add a description"
            >
              Add a description…
            </p>
          ) : null}
        </div>
        {!selectedChannel.is_category && (
          voiceChannelId === selectedChannel.id ? (
            <button
              onClick={onVoiceLeave}
              className="btn-voice-header btn-voice-leave"
              title="Leave voice"
            >
              🔴 Leave Voice
            </button>
          ) : (
            <button
              onClick={onVoiceJoin}
              className="btn-voice-header btn-voice-join"
              title="Join voice in this channel"
            >
              🎙 Join Voice
            </button>
          )
        )}
        <button
          onClick={onToggleSearch}
          className="btn-icon-header"
          title="Search messages"
          aria-label="Search messages"
        >
          🔍
        </button>
        <button
          onClick={onToggleMemberSidebar}
          className="btn-icon-header"
          title={memberSidebarHidden ? "Show member list" : "Hide member list"}
          aria-label={memberSidebarHidden ? "Show member list" : "Hide member list"}
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
            placeholder={`Search in #${selectedChannel.name}…`}
          />
          {searchResults !== null && (
            <span className="muted search-count">
              {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
            </span>
          )}
          <button onClick={onCloseSearch} className="btn-small">Close</button>
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
          <span>You're sharing</span>
          {(shareKbps ?? 0) > 0 && (
            <span className="muted">{shareKbps} kbps</span>
          )}
          <button className="stop-btn" onClick={onStopShare}>
            Stop sharing
          </button>
        </div>
      )}
    </>
  );
}
