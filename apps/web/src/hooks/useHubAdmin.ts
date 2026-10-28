import { useState } from "react";
import i18n from "@wavvon/i18n";
import { hubFetch } from "@platform";
import { getHubSettings, saveHubSettings, getHubListingStatus, setHubListed as setHubListedRemote } from "@platform";
import { muteMember, unmuteMember, listMutes, timeoutMember, voiceMuteMember, voiceUnmuteMember, listVoiceMutes } from "@platform";
import { listBans, listInvites, listPendingUsers, listHubMembers } from "@platform";
import { HubApiError } from "../platform/http";
import type {
  MemberAdminInfo,
  MuteInfo,
  BanInfo,
  InviteInfo,
  PendingUser,
  RoleInfo,
} from "@shared/types";
import type { HubAdminTab, NameColorMode } from "@wavvon/ui";

interface UseHubAdminParams {
  activeHubId: string | null;
  /** Called after settings save on the hub succeeds — the caller owns the
   * locally-stored hub list (whose hub_name/hub_icon are written at add-time
   * and otherwise never refreshed) and must sync it. */
  onSaved?: () => void;
  /** A member was kicked or banned: the caller's own member list is stale. */
  onMemberRemoved?: (publicKey: string) => void;
}

export function useHubAdmin({ activeHubId, onSaved, onMemberRemoved }: UseHubAdminParams) {
  const [showHubAdmin, setShowHubAdmin] = useState(false);
  const [hubAdminTab, setHubAdminTab] = useState<HubAdminTab>("overview");
  const [hubAdminName, setHubAdminName] = useState("");
  const [hubAdminDescription, setHubAdminDescription] = useState("");
  const [hubAdminIcon, setHubAdminIcon] = useState("");
  const [hubAdminRequireApproval, setHubAdminRequireApproval] = useState(false);
  const [hubAdminMinLevel, setHubAdminMinLevel] = useState(0);
  const [hubAdminWelcomeLabel, setHubAdminWelcomeLabel] = useState("");
  const [hubAdminFarewellLabel, setHubAdminFarewellLabel] = useState("");
  const [hubAdminWelcomeInviteUrl, setHubAdminWelcomeInviteUrl] = useState("");
  const [hubAdminTimezone, setHubAdminTimezone] = useState("");
  const [hubAdminBirthdaysEnabled, setHubAdminBirthdaysEnabled] = useState(true);
  const [hubAdminNameColorMode, setHubAdminNameColorMode] = useState<NameColorMode>("role_over_user");
  const [hubAdminAfkChannelId, setHubAdminAfkChannelId] = useState("");
  const [hubAdminAfkTimeoutSecs, setHubAdminAfkTimeoutSecs] = useState(300);
  // Seeded with the hub default; the real value arrives from GET /hub/settings.
  const [hubAdminMaxAttachmentBytes, setHubAdminMaxAttachmentBytes] = useState(3 * 1024 * 1024);
  const [hubAdminSaveError, setHubAdminSaveError] = useState<string | null>(null);
  const [hubAdminMembers, setHubAdminMembers] = useState<MemberAdminInfo[]>([]);
  const [hubAdminBans, setHubAdminBans] = useState<BanInfo[]>([]);
  const [hubAdminInvites, setHubAdminInvites] = useState<InviteInfo[]>([]);
  const [hubAdminPending, setHubAdminPending] = useState<PendingUser[]>([]);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);
  const [hubListed, setHubListedState] = useState(false);
  const [voiceMutedKeys, setVoiceMutedKeys] = useState<Set<string>>(new Set());
  const [mutes, setMutes] = useState<MuteInfo[]>([]);

  async function openHubAdmin() {
    setShowHubAdmin(true);
    setHubAdminTab("overview");
    setHubAdminSaveError(null);
    try {
      const s = await getHubSettings();
      setHubAdminName(s.hub_name);
      setHubAdminDescription(s.hub_description ?? "");
      setHubAdminIcon(s.hub_icon ?? "");
      setHubAdminRequireApproval(s.require_approval ?? false);
      setHubAdminMinLevel(s.min_security_level ?? 0);
      setMaxChannelDepth(s.max_channel_depth ?? 0);
      setHubAdminWelcomeLabel(s.welcome_label ?? "");
      setHubAdminFarewellLabel(s.farewell_label ?? "");
      setHubAdminWelcomeInviteUrl(s.welcome_invite_url ?? "");
      setHubAdminTimezone(s.timezone ?? "");
      setHubAdminBirthdaysEnabled(s.birthdays_enabled ?? true);
      setHubAdminNameColorMode(s.name_color_mode ?? "role_over_user");
      setHubAdminAfkChannelId(s.afk_channel_id ?? "");
      setHubAdminAfkTimeoutSecs(s.afk_timeout_secs ?? 300);
      setHubAdminMaxAttachmentBytes(s.max_attachment_bytes ?? 3 * 1024 * 1024);
    } catch { /* prefill skipped */ }
    try {
      // The four paged lists go through their platform commands rather than a
      // raw hubFetch: each walks to exhaustion, and an admin table showing a
      // first page while saying nothing is the truncation the paging exists to
      // avoid.
      const [members, bans, invites, pending] = await Promise.allSettled([
        listHubMembers(),
        listBans(),
        listInvites(),
        listPendingUsers(),
      ]);
      if (members.status === "fulfilled") setHubAdminMembers(members.value);
      if (bans.status === "fulfilled") setHubAdminBans(bans.value);
      if (invites.status === "fulfilled") setHubAdminInvites(invites.value);
      if (pending.status === "fulfilled") setHubAdminPending(pending.value);
    } catch { /* ignore */ }
    try {
      setHubListedState(await getHubListingStatus());
    } catch { /* ignore */ }
    await refreshVoiceMutes();
    await refreshMutes().catch(() => {});
  }

  async function refreshMutes() {
    setMutes(await listMutes());
  }

  async function refreshVoiceMutes() {
    try {
      const mutes = await listVoiceMutes();
      setVoiceMutedKeys(new Set(mutes.map((m) => m.target_public_key)));
    } catch { /* ignore */ }
  }

  async function handleHubListedChange(next: boolean) {
    try {
      await setHubListedRemote(next);
      setHubListedState(next);
    } catch { /* leave state unchanged on error */ }
  }

  // Member actions throw on failure: HubAdminPage shows the hub's message.
  async function removeMember(publicKey: string) {
    setHubAdminMembers((prev) => prev.filter((m) => m.public_key !== publicKey));
    onMemberRemoved?.(publicKey);
  }

  async function handleKickMember(publicKey: string) {
    await hubFetch("/moderation/kick", { method: "POST", body: JSON.stringify({ target_public_key: publicKey }) });
    await removeMember(publicKey);
  }

  async function handleBanMember(publicKey: string) {
    await hubFetch("/moderation/bans", { method: "POST", body: JSON.stringify({ target_public_key: publicKey }) });
    await removeMember(publicKey);
    listBans().then(setHubAdminBans).catch(() => {});
  }

  async function handleMuteMember(publicKey: string) {
    await muteMember(publicKey, null);
    await refreshMutes();
  }

  async function handleUnmuteMember(publicKey: string) {
    await unmuteMember(publicKey);
    await refreshMutes();
  }

  async function handleTimeoutMember(publicKey: string) {
    const durationStr = prompt("Timeout duration in minutes (1-1440)", "10");
    if (!durationStr) return false;
    const minutes = Number(durationStr);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error(i18n.t("errors.invalid_duration"));
    await timeoutMember(publicKey, Math.floor(minutes * 60), null);
    await refreshMutes();
  }

  async function handleVoiceMuteMember(publicKey: string) {
    await voiceMuteMember(publicKey, null);
    setVoiceMutedKeys((prev) => new Set(prev).add(publicKey));
  }

  async function handleVoiceUnmuteMember(publicKey: string) {
    await voiceUnmuteMember(publicKey);
    setVoiceMutedKeys((prev) => {
      const next = new Set(prev);
      next.delete(publicKey);
      return next;
    });
  }

  async function saveHubAdminSettings() {
    setHubAdminSaveError(null);
    try {
      await saveHubSettings({
        name: hubAdminName,
        description: hubAdminDescription,
        icon: hubAdminIcon,
        require_approval: hubAdminRequireApproval,
        min_security_level: hubAdminMinLevel,
        max_channel_depth: maxChannelDepth,
        welcome_label: hubAdminWelcomeLabel,
        farewell_label: hubAdminFarewellLabel,
        welcome_invite_url: hubAdminWelcomeInviteUrl,
        timezone: hubAdminTimezone,
        birthdays_enabled: hubAdminBirthdaysEnabled,
        afk_channel_id: hubAdminAfkChannelId,
        afk_timeout_secs: hubAdminAfkTimeoutSecs,
        max_attachment_bytes: hubAdminMaxAttachmentBytes,
        name_color_mode: hubAdminNameColorMode,
      });
      onSaved?.();
    } catch (e) {
      setHubAdminSaveError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  function addInvite(inv: InviteInfo) {
    setHubAdminInvites((prev) => [...prev, inv]);
  }

  function removeInvite(code: string) {
    setHubAdminInvites((prev) => prev.filter((i) => i.code !== code));
  }

  function setMemberRoles(publicKey: string, roles: RoleInfo[]) {
    setHubAdminMembers((prev) => prev.map((m) => (m.public_key === publicKey ? { ...m, roles } : m)));
  }

  return {
    showHubAdmin,
    setShowHubAdmin,
    hubAdminTab,
    setHubAdminTab,
    hubAdminName,
    setHubAdminName,
    hubAdminDescription,
    setHubAdminDescription,
    hubAdminIcon,
    setHubAdminIcon,
    hubAdminRequireApproval,
    setHubAdminRequireApproval,
    hubAdminMinLevel,
    setHubAdminMinLevel,
    hubAdminWelcomeLabel,
    hubAdminFarewellLabel,
    setHubAdminFarewellLabel,
    setHubAdminWelcomeLabel,
    hubAdminWelcomeInviteUrl,
    setHubAdminWelcomeInviteUrl,
    hubAdminTimezone,
    setHubAdminTimezone,
    hubAdminBirthdaysEnabled,
    setHubAdminBirthdaysEnabled,
    hubAdminNameColorMode,
    setHubAdminNameColorMode,
    hubAdminAfkChannelId,
    setHubAdminAfkChannelId,
    hubAdminAfkTimeoutSecs,
    hubAdminMaxAttachmentBytes,
    setHubAdminMaxAttachmentBytes,
    setHubAdminAfkTimeoutSecs,
    hubAdminSaveError,
    hubAdminMembers,
    hubAdminBans,
    hubAdminInvites,
    hubAdminPending,
    maxChannelDepth,
    setMaxChannelDepth,
    hubListed,
    onHubListedChange: handleHubListedChange,
    voiceMutedKeys,
    onKickMember: handleKickMember,
    onBanMember: handleBanMember,
    onMuteMember: handleMuteMember,
    onUnmuteMember: handleUnmuteMember,
    mutes,
    onTimeoutMember: handleTimeoutMember,
    onVoiceMuteMember: handleVoiceMuteMember,
    onVoiceUnmuteMember: handleVoiceUnmuteMember,
    openHubAdmin,
    saveHubAdminSettings,
    addInvite,
    removeInvite,
    setMemberRoles,
  };
}
