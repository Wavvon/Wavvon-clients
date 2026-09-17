import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { ChannelSidebar } from "@wavvon/ui";
import type { VoiceMoveMenuState, SoundboardChip, WhisperReplyBind, UnreadCounts } from "@wavvon/ui";
import { formatPubkey, type TreeNode } from "@wavvon/core";
import { hasDraft } from "../utils/drafts";
import type {
  Channel,
  User,
  RoleInfo,
  AllianceInfo,
  AllianceSharedChannel,
  NotifyMode,
} from "../types";
import type { useVoice } from "../hooks/useVoice";
import type { useVideo } from "../hooks/useVideo";
import type { useWhisper } from "../hooks/useWhisper";
import type { useSoundboard } from "../hooks/useSoundboard";
import type { useNotificationPrefs } from "../hooks/useNotificationPrefs";
import type { useHubLifecycle } from "../hooks/useHubLifecycle";
import type { useChannelMessages } from "../hooks/useChannelMessages";
import type { useDms } from "../hooks/useDms";

interface Props {
  onRequestRemoveHub: (hubId: string) => void;
  view: "channels" | "dms";
  channels: Channel[];
  users: User[];
  publicKey: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  collapsedCategories: Record<string, Record<string, boolean>>;
  onToggleCategoryCollapsed: (hubId: string, categoryId: string) => void;
  voiceChannelNameHint: string | null;
  setVoiceMoveMenu: (menu: VoiceMoveMenuState | null) => void;
  hubDropdownOpen: boolean;
  setHubDropdownOpen: (v: boolean) => void;
  hideSilenced: boolean;
  setHideSilenced: Dispatch<SetStateAction<boolean>>;
  silencedChannelIds: Set<string>;
  userAlliances: AllianceInfo[];
  allianceChannels: Record<string, AllianceSharedChannel[]>;
  channelTree: TreeNode[];
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  clearHubFirstNotify: (hubId: string) => void;
  openHubAdmin: () => void;
  openHubAdminInvites: () => void;
  setShowQuickInvite: (v: boolean) => void;
  openCreateChannelUnder: (parentId: string | null, isCategory?: boolean) => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: Channel) => void;
  setShowCreateChannel: (v: boolean) => void;
  setChannelSettingsModal: (channel: Channel | null) => void;
  leaveVoiceChannel: () => void;
  canMoveMembers: boolean;
  openFriends: () => void;
  openSettings: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  setShowSearchBar: (v: boolean) => void;
  myPresence: { status: "online" | "away" | "dnd" | "invisible" };
  onSetStatus: (status: "online" | "away" | "dnd" | "invisible", ttlMinutes: number | null) => void;
  showWhisperPanel: boolean;
  setShowWhisperPanel: Dispatch<SetStateAction<boolean>>;
  soundboardChipsByChannel: Record<string, SoundboardChip[]>;
  whisperReplyBind: WhisperReplyBind;
  onSetWhisperReplyBind: (bind: WhisperReplyBind) => void;

  voice: ReturnType<typeof useVoice>;
  video: ReturnType<typeof useVideo>;
  whisper: ReturnType<typeof useWhisper>;
  soundboard: ReturnType<typeof useSoundboard>;
  notifyPrefs: ReturnType<typeof useNotificationPrefs>;
  hubLifecycle: ReturnType<typeof useHubLifecycle>;
  channelMessages: ReturnType<typeof useChannelMessages>;
  unreadCounts: UnreadCounts;
  dms: ReturnType<typeof useDms>;
}

// Absorbs the ~90-prop ChannelSidebar call site: grouped hook-result objects
// (voice, video, whisper, soundboard, notifyPrefs, hubLifecycle,
// channelMessages, unreadCounts, dms) stand in for the flat prop list, and
// the small composed callbacks that used to live inline in App's JSX (they
// each only close over values already in one of those groups or the
// singular props here) move in with them. ChannelSidebar's own prop surface
// is untouched.
export function ChannelSidebarContainer({
  view, channels, users, publicKey, isAdmin, myRoles,
  collapsedCategories, onToggleCategoryCollapsed,
  voiceChannelNameHint, setVoiceMoveMenu,
  hubDropdownOpen, setHubDropdownOpen,
  hideSilenced, setHideSilenced, silencedChannelIds,
  userAlliances, allianceChannels,
  channelTree, effectiveNotifyMode, clearHubFirstNotify,
  openHubAdmin, openHubAdminInvites, setShowQuickInvite,
  openCreateChannelUnder, onChannelContextMenu,
  setShowCreateChannel, setChannelSettingsModal,
  leaveVoiceChannel, canMoveMembers, openFriends, openSettings, onDragEnd,
  setShowSearchBar, myPresence, onSetStatus,
  showWhisperPanel, setShowWhisperPanel, soundboardChipsByChannel,
  whisperReplyBind, onSetWhisperReplyBind,
  onRequestRemoveHub,
  voice, video, whisper, soundboard, notifyPrefs, hubLifecycle, channelMessages,
  unreadCounts, dms,
}: Props) {
  const canOpenChannelSettings =
    isAdmin ||
    myRoles.some(
      (r) => r.permissions?.includes("roles.manage") || r.permissions?.includes("channels.permissions"),
    );
  const canCreateInvites = isAdmin || myRoles.some((r) => r.permissions?.includes("channels.manage"));
  const canUseSoundboard = isAdmin || myRoles.some((r) => r.permissions?.includes("voice.soundboard.use"));

  return (
    <ChannelSidebar
      view={view}
      activeHubId={hubLifecycle.activeHubId}
      hubs={hubLifecycle.hubs}
      channels={channels}
      selectedChannel={channelMessages.selectedChannel}
      unreadByChannel={unreadCounts.unreadByChannel}
      collapsedCategories={collapsedCategories}
      voicePartByChannel={voice.voicePartByChannel}
      voiceChannelId={voice.voiceChannelId}
      voiceChannelNameHint={voiceChannelNameHint}
      selfMuted={voice.selfMuted}
      selfDeafened={voice.selfDeafened}
      users={users}
      publicKey={publicKey}
      pingByHub={hubLifecycle.pingByHub}
      isAdmin={isAdmin}
      canOpenChannelSettings={canOpenChannelSettings}
      canCreateInvites={canCreateInvites}
      hasDraft={hasDraft}
      hubNotifyMode={notifyPrefs.hubNotifyMode}
      hubDropdownOpen={hubDropdownOpen}
      hubTimezone={hubLifecycle.activeHubTimezone}
      hideSilenced={hideSilenced}
      silencedChannelIds={silencedChannelIds}
      userAlliances={userAlliances}
      allianceChannels={allianceChannels}
      selectedAllianceChannel={channelMessages.selectedAllianceChannel}
      conversations={dms.conversations}
      selectedConversation={dms.selectedConversation}
      unreadDms={unreadCounts.unreadDms}
      channelTree={channelTree}
      effectiveNotifyMode={effectiveNotifyMode}
      onToggleCategoryCollapsed={onToggleCategoryCollapsed}
      onHubDropdownOpenChange={setHubDropdownOpen}
      onSetHubMode={notifyPrefs.setHubMode}
      onClearHubUnread={(hubId) => { unreadCounts.clearHubUnread(hubId); clearHubFirstNotify(hubId); }}
      onRemoveHub={onRequestRemoveHub}
      onOpenHubAdmin={() => { setHubDropdownOpen(false); openHubAdmin(); }}
      onOpenHubAdminInvites={() => { setHubDropdownOpen(false); openHubAdminInvites(); }}
      onOpenQuickInvite={() => setShowQuickInvite(true)}
      onOpenCreateChannel={openCreateChannelUnder}
      onSelectChannel={channelMessages.selectChannel}
      onChannelContextMenu={onChannelContextMenu}
      onOpenChannelSettings={(ch) => { setShowCreateChannel(false); setChannelSettingsModal(ch); }}
      onVoiceJoin={voice.handleVoiceJoin}
      onVoiceLeave={leaveVoiceChannel}
      onParticipantContextMenu={canMoveMembers ? (e, p, channelId) => {
        e.preventDefault();
        if (p.public_key === publicKey) return; // hide self — move your own voice by joining directly
        setVoiceMoveMenu({
          pubkey: p.public_key,
          displayName: p.display_name || formatPubkey(p.public_key),
          position: { x: e.clientX, y: e.clientY },
          currentChannelId: channelId,
        });
      } : undefined}
      onSelectAllianceChannel={channelMessages.selectAllianceChannel}
      onSelectConversation={dms.selectConversation}
      onOpenFriends={openFriends}
      onToggleSelfMute={voice.toggleSelfMute}
      onToggleSelfDeafen={voice.toggleSelfDeafen}
      onOpenSettings={openSettings}
      onDragEnd={onDragEnd}
      onToggleHideSilenced={() => setHideSilenced((v) => !v)}
      sharing={voice.sharing}
      onScreenShare={voice.handleScreenShare}
      onOpenSearch={() => setShowSearchBar(true)}
      myStatus={myPresence.status === "online" ? null : myPresence.status}
      onSetStatus={onSetStatus}
      voiceGains={voice.voiceGains}
      onSetVoiceGain={voice.setVoiceGain}
      inboundWhispers={whisper.inboundWhispers}
      isWhispering={whisper.isWhispering}
      whisperTargets={whisper.whisperTargets}
      whisperLists={whisper.whisperLists}
      showWhisperPanel={showWhisperPanel}
      onToggleWhisperPanel={() => setShowWhisperPanel((p) => !p)}
      onCloseWhisperPanel={() => setShowWhisperPanel(false)}
      onStartWhisper={whisper.startWhisper}
      onStopWhisper={whisper.stopWhisper}
      onSaveWhisperList={whisper.saveWhisperList}
      onListWhisperRoles={() =>
        invoke<RoleInfo[]>("list_roles").then((rs) => rs.map((r) => ({ id: r.id, name: r.name })))
      }
      onDeleteWhisperList={whisper.deleteWhisperList}
      whisperReplyBind={whisperReplyBind}
      onSetWhisperReplyBind={onSetWhisperReplyBind}
      whisperOptout={whisper.whisperOptout}
      onSetWhisperOptout={whisper.setWhisperOptout}
      videoEnabled={video.videoEnabled}
      onToggleVideo={(deviceId) => (video.videoEnabled ? video.disableVideo() : video.enableVideo(deviceId))}
      canUseSoundboard={canUseSoundboard}
      onListSoundboardClips={soundboard.listClips}
      onTriggerSoundboardClip={soundboard.triggerClip}
      soundboardPlayingClipId={soundboard.playingClipId}
      soundboardChips={voice.voiceChannelId ? soundboardChipsByChannel[voice.voiceChannelId] ?? [] : []}
    />
  );
}
