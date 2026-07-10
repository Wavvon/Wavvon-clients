import { useState } from "react";
import { hubFetch } from "@platform";
import { getHubSettings, saveHubSettings } from "@platform";
import { HubApiError } from "../platform/http";
import type {
  MemberAdminInfo,
  BanInfo,
  InviteInfo,
  PendingUser,
  RoleInfo,
} from "@shared/types";
import type { HubAdminTab } from "@components/admin/HubAdminPage";

interface UseHubAdminParams {
  activeHubId: string | null;
  /** Called after settings save on the hub succeeds, with the saved name —
   * the caller owns the locally-stored hub list (whose hub_name is written
   * at add-time and otherwise never refreshed) and must sync it. */
  onSaved?: (name: string) => void;
}

export function useHubAdmin({ activeHubId, onSaved }: UseHubAdminParams) {
  const [showHubAdmin, setShowHubAdmin] = useState(false);
  const [hubAdminTab, setHubAdminTab] = useState<HubAdminTab>("overview");
  const [hubAdminName, setHubAdminName] = useState("");
  const [hubAdminDescription, setHubAdminDescription] = useState("");
  const [hubAdminIcon, setHubAdminIcon] = useState("");
  const [hubAdminRequireApproval, setHubAdminRequireApproval] = useState(false);
  const [hubAdminMinLevel, setHubAdminMinLevel] = useState(0);
  const [hubAdminWelcomeLabel, setHubAdminWelcomeLabel] = useState("");
  const [hubAdminWelcomeInviteUrl, setHubAdminWelcomeInviteUrl] = useState("");
  const [hubAdminSaveError, setHubAdminSaveError] = useState<string | null>(null);
  const [hubAdminMembers, setHubAdminMembers] = useState<MemberAdminInfo[]>([]);
  const [hubAdminBans, setHubAdminBans] = useState<BanInfo[]>([]);
  const [hubAdminInvites, setHubAdminInvites] = useState<InviteInfo[]>([]);
  const [hubAdminPending, setHubAdminPending] = useState<PendingUser[]>([]);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);

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
      setHubAdminWelcomeInviteUrl(s.welcome_invite_url ?? "");
    } catch { /* prefill skipped */ }
    try {
      const [members, bans, invites, pending] = await Promise.allSettled([
        hubFetch("/hub/members").then((r) => r.json() as Promise<MemberAdminInfo[]>),
        hubFetch("/moderation/bans").then((r) => r.json() as Promise<BanInfo[]>),
        hubFetch("/invites").then((r) => r.json() as Promise<InviteInfo[]>),
        hubFetch("/hub/pending").then((r) => r.json() as Promise<PendingUser[]>),
      ]);
      if (members.status === "fulfilled") setHubAdminMembers(members.value);
      if (bans.status === "fulfilled") setHubAdminBans(bans.value);
      if (invites.status === "fulfilled") setHubAdminInvites(invites.value);
      if (pending.status === "fulfilled") setHubAdminPending(pending.value);
    } catch { /* ignore */ }
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
        welcome_invite_url: hubAdminWelcomeInviteUrl,
      });
      onSaved?.(hubAdminName);
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
    setHubAdminWelcomeLabel,
    hubAdminWelcomeInviteUrl,
    setHubAdminWelcomeInviteUrl,
    hubAdminSaveError,
    hubAdminMembers,
    hubAdminBans,
    hubAdminInvites,
    hubAdminPending,
    maxChannelDepth,
    setMaxChannelDepth,
    openHubAdmin,
    saveHubAdminSettings,
    addInvite,
    removeInvite,
    setMemberRoles,
  };
}
