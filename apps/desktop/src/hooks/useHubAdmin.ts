import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Hub,
  RoleInfo,
  MemberAdminInfo,
  BanInfo,
  InviteInfo,
  PendingUser,
} from "../types";
import type { HubAdminTab } from "@wavvon/ui";

interface UseHubAdminParams {
  activeHubId: string | null;
  hubs: Hub[];
  setHubs: (updater: (prev: Hub[]) => Hub[]) => void;
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useHubAdmin({
  activeHubId,
  hubs,
  setHubs,
  setError,
  setToast,
}: UseHubAdminParams) {
  const [showHubAdmin, setShowHubAdmin] = useState(false);
  const [hubAdminTab, setHubAdminTab] = useState<HubAdminTab>("overview");
  const [myRoles, setMyRoles] = useState<RoleInfo[]>([]);
  const [myApprovalStatus, setMyApprovalStatus] = useState<
    "approved" | "pending" | "unknown"
  >("unknown");
  const [adminHubName, setAdminHubName] = useState("");
  const [adminHubDescription, setAdminHubDescription] = useState("");
  const [adminHubIcon, setAdminHubIcon] = useState("");
  const [adminWelcomeLabel, setAdminWelcomeLabel] = useState("");
  const [adminWelcomeInviteUrl, setAdminWelcomeInviteUrl] = useState("");
  const [adminMembers, setAdminMembers] = useState<MemberAdminInfo[]>([]);
  const [adminBans, setAdminBans] = useState<BanInfo[]>([]);
  const [adminInvites, setAdminInvites] = useState<InviteInfo[]>([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minSecurityLevel, setMinSecurityLevel] = useState(0);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);
  const [pendingMembers, setPendingMembers] = useState<PendingUser[]>([]);
  const [hubListed, setHubListedState] = useState(false);

  const isAdmin = myRoles.some((r) => r.permissions.includes("admin"));

  function activeHubUrl(): string {
    return hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
  }

  async function openHubAdmin() {
    setShowHubAdmin(true);
    setHubAdminTab("overview");
    try {
      const branding = await invoke<{
        name: string;
        description: string | null;
        icon: string | null;
        welcome_label: string | null;
        welcome_invite_url: string | null;
      }>("get_hub_branding");
      setAdminHubName(branding.name);
      setAdminHubDescription(branding.description ?? "");
      setAdminHubIcon(branding.icon ?? "");
      setAdminWelcomeLabel(branding.welcome_label ?? "");
      setAdminWelcomeInviteUrl(branding.welcome_invite_url ?? "");

      const settings = await invoke<{
        require_approval: boolean;
        invite_only: boolean;
        min_security_level: number;
        max_channel_depth: number;
      }>("get_hub_settings");
      setRequireApproval(settings.require_approval);
      setMinSecurityLevel(settings.min_security_level ?? 0);
      setMaxChannelDepth(settings.max_channel_depth ?? 0);
    } catch (e) {
      setError(String(e));
    }
    const hubUrl = activeHubUrl();
    if (hubUrl) {
      try {
        const res = await fetch(hubUrl + "/federation/listing");
        const data: { listed?: boolean } = await res.json();
        if (typeof data.listed === "boolean") setHubListedState(data.listed);
      } catch { /* ignore */ }
    }
  }

  async function openHubAdminInvites() {
    await openHubAdmin();
    setHubAdminTab("invites");
  }

  async function handleSaveHubBranding() {
    try {
      await invoke("update_hub_branding", {
        name: adminHubName.trim() || null,
        description: adminHubDescription,
        icon: adminHubIcon,
        requireApproval,
        minSecurityLevel,
        maxChannelDepth,
        welcomeLabel: adminWelcomeLabel,
        welcomeInviteUrl: adminWelcomeInviteUrl,
      });
      const refreshed = await invoke<Hub[]>("list_hubs");
      setHubs(() => refreshed);
      setToast("Hub settings saved");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleHubListedChange(next: boolean) {
    try {
      await invoke("set_hub_listed", { hubUrl: activeHubUrl(), listed: next });
      setHubListedState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshPending() {
    try {
      const p = await invoke<PendingUser[]>("list_pending_members");
      setPendingMembers(p);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleApproveMember(publicKey: string) {
    try {
      await invoke("approve_member", { targetPublicKey: publicKey });
      setToast("Member approved");
      await refreshPending();
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshMembers() {
    try {
      const m = await invoke<MemberAdminInfo[]>("list_hub_members");
      setAdminMembers(m);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleKickMember(publicKey: string) {
    const reason = prompt("Reason for kick (optional)") ?? "";
    try {
      await invoke("kick_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Kicked");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleBanMember(publicKey: string) {
    const reason = prompt("Reason for ban (optional)") ?? "";
    if (!confirm("Ban this user? They won't be able to rejoin.")) return;
    try {
      await invoke("ban_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Banned");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleMuteMember(publicKey: string) {
    const reason = prompt("Reason for mute (optional)") ?? "";
    try {
      await invoke("mute_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Muted");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleTimeoutMember(publicKey: string) {
    const durationStr = prompt("Timeout duration in minutes (1-1440)", "10");
    if (!durationStr) return;
    const minutes = Number(durationStr);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      setError("Invalid duration");
      return;
    }
    const reason = prompt("Reason (optional)") ?? "";
    try {
      await invoke("timeout_user_cmd", {
        targetPublicKey: publicKey,
        durationSeconds: Math.floor(minutes * 60),
        reason: reason.trim() || null,
      });
      setToast(`Timed out for ${minutes}m`);
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshBans() {
    try {
      const b = await invoke<BanInfo[]>("list_bans");
      setAdminBans(b);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUnban(publicKey: string) {
    if (!confirm("Unban this user? They'll be able to rejoin.")) return;
    try {
      await invoke("unban_user", { targetPublicKey: publicKey });
      setToast("Unbanned");
      await refreshBans();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshInvites() {
    try {
      const i = await invoke<InviteInfo[]>("list_invites");
      setAdminInvites(i);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateInvite(
    maxUses: number | null,
    expiresInSeconds: number | null,
    grantRoleId: string | null,
  ) {
    try {
      await invoke<InviteInfo>("create_invite", { maxUses, expiresInSeconds, grantRoleId });
      await refreshInvites();
      setToast("Invite created");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevokeInvite(code: string) {
    if (!confirm(`Revoke invite ${code}?`)) return;
    try {
      await invoke("revoke_invite", { code });
      await refreshInvites();
      setToast("Invite revoked");
    } catch (e) {
      setError(String(e));
    }
  }

  function loadAdminTabData(tab: HubAdminTab, refreshVoiceMutes: () => void) {
    if (tab === "members") {
      refreshMembers();
      refreshPending();
      refreshVoiceMutes();
    } else if (tab === "bans") {
      refreshBans();
    } else if (tab === "invites") {
      refreshInvites();
    }
  }

  return {
    showHubAdmin,
    setShowHubAdmin,
    hubAdminTab,
    setHubAdminTab,
    myRoles,
    setMyRoles,
    myApprovalStatus,
    setMyApprovalStatus,
    adminHubName,
    setAdminHubName,
    adminHubDescription,
    setAdminHubDescription,
    adminHubIcon,
    setAdminHubIcon,
    adminWelcomeLabel,
    setAdminWelcomeLabel,
    adminWelcomeInviteUrl,
    setAdminWelcomeInviteUrl,
    adminMembers,
    adminBans,
    adminInvites,
    requireApproval,
    setRequireApproval,
    minSecurityLevel,
    setMinSecurityLevel,
    maxChannelDepth,
    setMaxChannelDepth,
    pendingMembers,
    hubListed,
    onHubListedChange: handleHubListedChange,
    isAdmin,
    openHubAdmin,
    openHubAdminInvites,
    handleSaveHubBranding,
    refreshPending,
    handleApproveMember,
    refreshMembers,
    handleKickMember,
    handleBanMember,
    handleMuteMember,
    handleTimeoutMember,
    refreshBans,
    handleUnban,
    refreshInvites,
    handleCreateInvite,
    handleRevokeInvite,
    loadAdminTabData,
  };
}
