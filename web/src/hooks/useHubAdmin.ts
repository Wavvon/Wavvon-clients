import { useState } from "react";
import { hubFetch } from "@platform";
import { getHubSettings, saveHubSettings } from "@platform";
import type {
  MemberAdminInfo,
  BanInfo,
  InviteInfo,
  PendingUser,
} from "@shared/types";
import type { HubAdminTab } from "../components/HubAdminPage";

interface UseHubAdminParams {
  activeHubId: string | null;
}

export function useHubAdmin({ activeHubId }: UseHubAdminParams) {
  const [showHubAdmin, setShowHubAdmin] = useState(false);
  const [hubAdminTab, setHubAdminTab] = useState<HubAdminTab>("overview");
  const [hubAdminName, setHubAdminName] = useState("");
  const [hubAdminDescription, setHubAdminDescription] = useState("");
  const [hubAdminIcon, setHubAdminIcon] = useState("");
  const [hubAdminRequireApproval, setHubAdminRequireApproval] = useState(false);
  const [hubAdminMinLevel, setHubAdminMinLevel] = useState(0);
  const [hubAdminMembers, setHubAdminMembers] = useState<MemberAdminInfo[]>([]);
  const [hubAdminBans, setHubAdminBans] = useState<BanInfo[]>([]);
  const [hubAdminInvites, setHubAdminInvites] = useState<InviteInfo[]>([]);
  const [hubAdminPending, setHubAdminPending] = useState<PendingUser[]>([]);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);

  async function openHubAdmin() {
    setShowHubAdmin(true);
    setHubAdminTab("overview");
    try {
      const s = await getHubSettings();
      setHubAdminName(s.hub_name);
      setHubAdminDescription(s.hub_description ?? "");
      setHubAdminIcon(s.hub_icon ?? "");
      setHubAdminRequireApproval(s.require_approval ?? false);
      setHubAdminMinLevel(s.min_security_level ?? 0);
      setMaxChannelDepth(s.max_channel_depth ?? 0);
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
    try {
      await saveHubSettings({
        name: hubAdminName,
        description: hubAdminDescription,
        icon: hubAdminIcon,
        require_approval: hubAdminRequireApproval,
        min_security_level: hubAdminMinLevel,
        max_channel_depth: maxChannelDepth,
      });
    } catch { /* ignore */ }
  }

  function addInvite(inv: InviteInfo) {
    setHubAdminInvites((prev) => [...prev, inv]);
  }

  function removeInvite(code: string) {
    setHubAdminInvites((prev) => prev.filter((i) => i.code !== code));
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
  };
}
