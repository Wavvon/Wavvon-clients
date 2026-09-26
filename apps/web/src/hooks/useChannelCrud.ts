import { useState } from "react";
import { hubFetch, HubApiError, uploadFile } from "@platform";
import type { ChannelSettingsSaveFields } from "@wavvon/ui";
import type { HubSetupWizardCreateChannelFields } from "@wavvon/ui";
import type { Channel } from "@shared/types";

export interface UseChannelCrudParams {
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  selectedChannel: Channel | null;
  setSelectedChannel: (channel: Channel | null) => void;
  showHubError: (msg: string) => void;
  handleSelectChannel: (channel: Channel) => void;
  activeHubId: string | null;
  closeHubSetupWizard: (hubId: string) => void;
}

// Channel create/edit/delete/rename CRUD against the hub's /channels routes,
// plus the modal/context state each of those flows owns.
export function useChannelCrud({
  setChannels, selectedChannel, setSelectedChannel, showHubError, handleSelectChannel,
  activeHubId, closeHubSetupWizard,
}: UseChannelCrudParams) {
  const [bannerEditChannel, setBannerEditChannel] = useState<Channel | null>(null);
  const [createChannelCtx, setCreateChannelCtx] = useState<{ parentId: string | null; isCategory: boolean } | null>(null);
  const [createChannelLoading, setCreateChannelLoading] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [channelSettingsCtx, setChannelSettingsCtx] = useState<Channel | null>(null);
  const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
  const [channelSettingsDeleting, setChannelSettingsDeleting] = useState(false);
  const [channelSettingsError, setChannelSettingsError] = useState<string | null>(null);
  // Temp-room owner rename (temp-voice-channels.md §3): a non-admin owner
  // gets a minimal rename modal, not the full channel-settings surface.
  const [editDescChannel, setEditDescChannel] = useState<Channel | null>(null);
  const [editDescValue, setEditDescValue] = useState("");
  const [renameRoomCtx, setRenameRoomCtx] = useState<Channel | null>(null);
  const [renameRoomName, setRenameRoomName] = useState("");
  const [renameRoomSaving, setRenameRoomSaving] = useState(false);
  const [renameRoomError, setRenameRoomError] = useState<string | null>(null);

  // ChannelSettingsModal's create mode (unify-create-with-editing): the hub's
  // create-channel route doesn't take icon/color, so those ride a follow-up
  // PATCH against the just-created id — same "create then patch" pattern the
  // banner upload below already used.
  async function handleCreateChannel(fields: ChannelSettingsSaveFields) {
    if (!createChannelCtx) return;
    const { channelType, isCategory, banner } = fields;
    setCreateChannelLoading(true);
    setCreateChannelError(null);
    try {
      const res = await hubFetch("/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          parent_id: createChannelCtx.parentId ?? undefined,
          is_category: isCategory ?? false,
          channel_type: isCategory ? undefined : channelType,
          description: fields.description || undefined,
          spawner_name_template: !isCategory && channelType === "spawner" ? fields.spawnerNameTemplate : undefined,
          banner_url: channelType === "banner" ? banner?.url : undefined,
          nsfw: fields.nsfw,
        }),
      });
      const created = (await res.json()) as Channel;
      // Hub-uploaded banner (banner-channels.md §upload flow): the channel
      // must exist first, then the image is uploaded to it, then the channel
      // is patched with the returned file id.
      if (channelType === "banner" && banner?.file) {
        const uploaded = await uploadFile(created.id, banner.file);
        await hubFetch(`/channels/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ banner_file_id: uploaded.id }),
        });
      }
      if (fields.icon !== null || fields.color !== null || fields.customIconSvg !== null) {
        await hubFetch(`/channels/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: fields.icon, color: fields.color, custom_icon_svg: fields.customIconSvg }),
        });
      }
      setCreateChannelCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setCreateChannelError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setCreateChannelLoading(false);
    }
  }

  // HubSetupWizard's onCreateChannel — a plain create call (templates don't
  // touch icon/color/banner), reusing the same POST /channels route as
  // handleCreateChannel above.
  async function createChannelForWizard(fields: HubSetupWizardCreateChannelFields): Promise<{ id: string }> {
    const res = await hubFetch("/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fields.name,
        parent_id: fields.parentId ?? undefined,
        is_category: fields.isCategory,
        channel_type: fields.isCategory ? undefined : fields.channelType,
      }),
    });
    const created = (await res.json()) as Channel;
    return { id: created.id };
  }

  function handleHubSetupWizardComplete(firstChannelId: string | null) {
    if (!activeHubId) return;
    closeHubSetupWizard(activeHubId);
    hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then((list) => {
      setChannels(list);
      const first = firstChannelId ? list.find((c) => c.id === firstChannelId) : undefined;
      if (first) handleSelectChannel(first);
    }).catch(() => {});
  }

  async function handleSaveChannelSettings(fields: ChannelSettingsSaveFields) {
    if (!channelSettingsCtx) return;
    setChannelSettingsSaving(true);
    setChannelSettingsError(null);
    try {
      // A replacement banner image is uploaded first so its file id can ride
      // the same PATCH as the rest (the hub clears the other source column).
      let bannerFileId: string | undefined;
      if (fields.banner?.file) {
        bannerFileId = (await uploadFile(channelSettingsCtx.id, fields.banner.file)).id;
      }
      await hubFetch(`/channels/${channelSettingsCtx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // color/icon are appearance fields (require manage_channel_icons);
        // only sent when provided so a plain rename doesn't touch them.
        body: JSON.stringify({
          name: fields.name,
          description: fields.description || null,
          color: fields.color,
          icon: fields.icon,
          custom_icon_svg: fields.customIconSvg,
          banner_url: fields.banner?.url,
          banner_file_id: bannerFileId,
          forum_require_tag: fields.forumRequireTag,
          nsfw: fields.nsfw,
        }),
      });
      setChannelSettingsCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setChannelSettingsError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setChannelSettingsSaving(false);
    }
  }

  async function handleSaveDescription() {
    if (!editDescChannel) return;
    const desc = editDescValue.trim() || null;
    try {
      await hubFetch(`/channels/${editDescChannel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      setChannels((prev) => prev.map((c) => (c.id === editDescChannel.id ? { ...c, description: desc } : c)));
      if (selectedChannel?.id === editDescChannel.id) {
        setSelectedChannel({ ...selectedChannel, description: desc });
      }
      setEditDescChannel(null);
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  async function handleRenameRoom() {
    if (!renameRoomCtx || !renameRoomName.trim()) return;
    setRenameRoomSaving(true);
    setRenameRoomError(null);
    try {
      await hubFetch(`/channels/${renameRoomCtx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Name ONLY: the server's temp-room owner grant covers exactly a
        // bare rename; any other field would require manage_channels.
        body: JSON.stringify({ name: renameRoomName.trim() }),
      });
      setRenameRoomCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setRenameRoomError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setRenameRoomSaving(false);
    }
  }

  async function handleDeleteChannel() {
    if (!channelSettingsCtx) return;
    setChannelSettingsDeleting(true);
    setChannelSettingsError(null);
    try {
      await hubFetch(`/channels/${channelSettingsCtx.id}`, { method: "DELETE" });
      if (selectedChannel?.id === channelSettingsCtx.id) setSelectedChannel(null);
      setChannelSettingsCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setChannelSettingsError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setChannelSettingsDeleting(false);
    }
  }

  // Retargets a banner channel at a new URL. The hub clears the other source
  // column, so a channel that was showing an uploaded file switches cleanly.
  async function handleSaveBannerUrl(channelId: string, bannerUrl: string) {
    try {
      await hubFetch(`/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banner_url: bannerUrl }),
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, banner_url: bannerUrl, banner_file_id: null } : c,
        ),
      );
      setBannerEditChannel(null);
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  return {
    bannerEditChannel, setBannerEditChannel,
    handleSaveBannerUrl,
    createChannelCtx, setCreateChannelCtx,
    createChannelLoading,
    createChannelError, setCreateChannelError,
    channelSettingsCtx, setChannelSettingsCtx,
    channelSettingsSaving,
    channelSettingsDeleting,
    channelSettingsError, setChannelSettingsError,
    editDescChannel, setEditDescChannel,
    editDescValue, setEditDescValue,
    renameRoomCtx, setRenameRoomCtx,
    renameRoomName, setRenameRoomName,
    renameRoomSaving,
    renameRoomError, setRenameRoomError,
    handleCreateChannel,
    createChannelForWizard,
    handleSaveChannelSettings,
    handleDeleteChannel,
    handleSaveDescription,
    handleRenameRoom,
    handleHubSetupWizardComplete,
  };
}
