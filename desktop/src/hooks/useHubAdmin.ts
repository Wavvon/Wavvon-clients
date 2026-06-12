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
import type { HubAdminTab } from "../components/HubAdminPage";

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
  const [adminRoles, setAdminRoles] = useState<RoleInfo[]>([]);
  const [adminMembers, setAdminMembers] = useState<MemberAdminInfo[]>([]);
  const [adminBans, setAdminBans] = useState<BanInfo[]>([]);
  const [adminInvites, setAdminInvites] = useState<InviteInfo[]>([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minSecurityLevel, setMinSecurityLevel] = useState(0);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);
  const [pendingMembers, setPendingMembers] = useState<PendingUser[]>([]);

  const isAdmin = myRoles.some((r) => r.permissions.includes("admin"));

  async function openHubAdmin() {
    setShowHubAdmin(true);
    setHubAdminTab("overview");
    try {
      const branding = await invoke<{
        name: string;
        description: string | null;
        icon: string | null;
      }>("get_hub_branding");
      setAdminHubName(branding.name);
      setAdminHubDescription(branding.description ?? "");
      setAdminHubIcon(branding.icon ?? "");

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
      });
      const refreshed = await invoke<Hub[]>("list_hubs");
      setHubs(() => refreshed);
      setToast("Hub settings saved");
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

  async function refreshRoles() {
    try {
      const r = await invoke<RoleInfo[]>("list_roles");
      setAdminRoles(r);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateRole(
    name: string,
    permissions: string[],
    priority: number,
    displaySeparately: boolean,
  ) {
    try {
      await invoke("create_role", { name, permissions, priority, displaySeparately });
      await refreshRoles();
      setToast("Role created");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUpdateRole(
    roleId: string,
    updates: {
      name?: string;
      permissions?: string[];
      priority?: number;
      display_separately?: boolean;
    },
  ) {
    try {
      await invoke("update_role", {
        roleId,
        name: updates.name ?? null,
        permissions: updates.permissions ?? null,
        priority: updates.priority ?? null,
        displaySeparately: updates.display_separately ?? null,
      });
      await refreshRoles();
      setToast("Role updated");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteRole(roleId: string) {
    if (!confirm("Delete this role? Users assigned to it will lose the role.")) return;
    try {
      await invoke("delete_role", { roleId });
      await refreshRoles();
      setToast("Role deleted");
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

  async function handleCreateInvite(maxUses: number | null, expiresInSeconds: number | null) {
    try {
      await invoke<InviteInfo>("create_invite", { maxUses, expiresInSeconds });
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

  async function handleToggleRoleAssignment(
    publicKey: string,
    roleId: string,
    hasRole: boolean,
  ) {
    try {
      if (hasRole) {
        await invoke("unassign_role", { targetPublicKey: publicKey, roleId });
      } else {
        await invoke("assign_role", { targetPublicKey: publicKey, roleId });
      }
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  function loadAdminTabData(tab: HubAdminTab, refreshVoiceMutes: () => void) {
    if (tab === "roles") {
      refreshRoles();
    } else if (tab === "members") {
      refreshRoles();
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
    adminRoles,
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
    isAdmin,
    openHubAdmin,
    openHubAdminInvites,
    handleSaveHubBranding,
    refreshPending,
    handleApproveMember,
    refreshRoles,
    handleCreateRole,
    handleUpdateRole,
    handleDeleteRole,
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
    handleToggleRoleAssignment,
    loadAdminTabData,
  };
}
