import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Channel,
  Hub,
  TauriFile,
} from "../types";
import type {
  ChannelSettingsSaveFields,
  HubSetupWizardCreateChannelFields,
} from "@wavvon/ui";
import {
  channelPermissionsTabActions,
  channelBansTabActions,
  channelTalkPowerTabActions,
} from "./channelSettingsTabActions";
import i18n from "@wavvon/i18n";

interface UseChannelCrudParams {
  hubs: Hub[];
  activeHubId: string | null;
  selectedChannel: Channel | null;
  selectChannel: (channel: Channel) => void;
  clearSelectedChannel: () => void;
  closeContextMenu: () => void;
  setChannels: (updater: (prev: Channel[]) => Channel[]) => void;
  setError: (msg: string) => void;
}

export function useChannelCrud({
  hubs,
  activeHubId,
  selectedChannel,
  selectChannel,
  clearSelectedChannel,
  closeContextMenu,
  setChannels,
  setError,
}: UseChannelCrudParams) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelParentId, setNewChannelParentId] = useState<string | null>(null);
  const [createIsCategory, setCreateIsCategory] = useState(false);
  const [createChannelLoading, setCreateChannelLoading] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);

  const [editDescriptionChannel, setEditDescriptionChannel] = useState<Channel | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState("");

  const [channelSettingsModal, setChannelSettingsModal] = useState<Channel | null>(null);
  const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
  const [channelSettingsDeleting, setChannelSettingsDeleting] = useState(false);
  const [channelSettingsError, setChannelSettingsError] = useState<string | null>(null);
  const [bannerEditChannel, setBannerEditChannel] = useState<Channel | null>(null);

  async function handleRenameChannel(channel: Channel) {
    const next = prompt("Rename channel", channel.name);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === channel.name) return;
    try {
      await invoke("rename_channel", { channelId: channel.id, name: trimmed });
      setChannels((prev) => prev.map((c) => c.id === channel.id ? { ...c, name: trimmed } : c));
      if (selectedChannel?.id === channel.id) {
        selectChannel({ ...selectedChannel, name: trimmed });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  // ChannelSettingsModal's create mode (unify-create-with-editing): create_channel
  // doesn't take icon/color, so those ride a follow-up update_channel_appearance
  // against the just-created id — same "create then patch" pattern the banner
  // upload below already used.
  async function handleCreateChannel(fields: ChannelSettingsSaveFields) {
    const { channelType, isCategory, banner } = fields;
    setCreateChannelLoading(true);
    setCreateChannelError(null);
    try {
      const channel = await invoke<Channel>("create_channel", {
        name: fields.name,
        parentId: newChannelParentId,
        isCategory: isCategory ?? false,
        channelType: isCategory ? undefined : channelType,
        description: fields.description ? fields.description : null,
        bannerUrl: channelType === "banner" ? (banner?.url || null) : null,
        spawnerNameTemplate: channelType === "spawner" ? (fields.spawnerNameTemplate ?? null) : null,
        nsfw: fields.nsfw,
      });

      if (channelType === "banner" && banner?.file) {
        const filePath = (banner.file as TauriFile).path;
        if (filePath) {
          const activeHub = hubs.find((h) => h.hub_id === activeHubId);
          if (activeHub) {
            const uploadResult = await invoke<{ file_id: string }>("upload_file", {
              hubUrl: activeHub.hub_url,
              channelId: channel.id,
              filePath,
            });
            if (uploadResult.file_id) {
              await invoke("patch_channel_banner_file", {
                channelId: channel.id,
                bannerFileId: uploadResult.file_id,
              });
              channel.banner_file_id = uploadResult.file_id;
            }
          }
        }
      }

      if (fields.icon !== null || fields.color !== null || fields.customIconSvg !== null) {
        await invoke("update_channel_appearance", {
          channelId: channel.id,
          icon: fields.icon,
          color: fields.color,
          customIconSvg: fields.customIconSvg,
        });
        channel.icon = fields.icon;
        channel.color = fields.color;
        channel.custom_icon_svg = fields.customIconSvg;
      }

      setChannels((prev) => [...prev, channel]);
      setNewChannelParentId(null);
      setShowCreateChannel(false);
      if (!channel.is_category && channel.channel_type !== "banner") {
        selectChannel(channel);
      }
    } catch (e) {
      setCreateChannelError(String(e));
    } finally {
      setCreateChannelLoading(false);
    }
  }

  // HubSetupWizard's onCreateChannel — a plain create call (templates don't
  // touch icon/color/banner), reusing the same create_channel command as
  // handleCreateChannel above.
  async function createChannelForWizard(fields: HubSetupWizardCreateChannelFields): Promise<{ id: string }> {
    const channel = await invoke<Channel>("create_channel", {
      name: fields.name,
      parentId: fields.parentId,
      isCategory: fields.isCategory,
      channelType: fields.isCategory ? undefined : fields.channelType,
      description: null,
      bannerUrl: null,
      spawnerNameTemplate: null,
      nsfw: false,
    });
    return { id: channel.id };
  }

  function openEditDescription(channel: Channel) {
    setEditDescriptionChannel(channel);
    setEditDescriptionValue(channel.description ?? "");
    closeContextMenu();
  }

  async function handleSaveDescription() {
    if (!editDescriptionChannel) return;
    const desc = editDescriptionValue.trim();
    try {
      await invoke("update_channel_description", {
        channelId: editDescriptionChannel.id,
        description: desc ? desc : null,
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === editDescriptionChannel.id
            ? { ...c, description: desc ? desc : null }
            : c
        )
      );
      if (selectedChannel?.id === editDescriptionChannel.id) {
        selectChannel({ ...selectedChannel, description: desc ? desc : null });
      }
      setEditDescriptionChannel(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteChannel(channelId: string) {
    if (!confirm(i18n.t("confirm.delete_channel"))) return;
    try {
      await invoke("delete_channel", { channelId });
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (selectedChannel?.id === channelId) {
        clearSelectedChannel();
      }
      closeContextMenu();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveBannerUrl(channelId: string, bannerUrl: string) {
    try {
      await invoke("patch_channel_banner_url", { channelId, bannerUrl });
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, banner_url: bannerUrl, banner_file_id: null } : c))
      );
    } catch (e) {
      setError(String(e));
    }
  }

  // ChannelSettingsModal's onSave — composes the individual PATCH-shaped
  // Tauri commands the settings tab touches. A banner *file* goes through
  // upload_file_bytes (base64 over the IPC boundary — webview Files carry
  // bytes but no filesystem path).
  async function handleSaveChannelSettings(fields: ChannelSettingsSaveFields) {
    if (!channelSettingsModal) return;
    const channel = channelSettingsModal;
    const { name, description, color, icon, customIconSvg, banner, forumRequireTag, nsfw, switchType } = fields;
    setChannelSettingsSaving(true);
    setChannelSettingsError(null);
    try {
      if (forumRequireTag !== undefined && forumRequireTag !== (channel.forum_require_tag ?? false)) {
        await invoke("set_forum_require_tag", { channelId: channel.id, requireTag: forumRequireTag });
      }
      if (nsfw !== (channel.nsfw ?? false)) {
        await invoke("set_channel_nsfw", { channelId: channel.id, nsfw });
      }
      if (switchType) {
        await invoke("set_channel_type", { channelId: channel.id, channelType: switchType });
      }
      if (name !== channel.name) {
        await invoke("rename_channel", { channelId: channel.id, name });
      }
      if (!channel.is_category && (description || null) !== channel.description) {
        await invoke("update_channel_description", { channelId: channel.id, description: description || null });
      }
      if (
        color !== (channel.color ?? null) ||
        icon !== (channel.icon ?? null) ||
        customIconSvg !== (channel.custom_icon_svg ?? null)
      ) {
        await invoke("update_channel_appearance", { channelId: channel.id, icon, color, customIconSvg });
      }
      const bannerHub = hubs.find((h) => h.hub_id === activeHubId) ?? hubs.find((h) => h.is_active);
      if (banner?.file && bannerHub) {
        const buf = await banner.file.arrayBuffer();
        let bin = "";
        const view = new Uint8Array(buf);
        for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
        const up = await invoke<{ file_id: string }>("upload_file_bytes", {
          hubUrl: bannerHub.hub_url,
          channelId: channel.id,
          filename: banner.file.name,
          mimeType: banner.file.type || "application/octet-stream",
          bytesB64: btoa(bin),
        });
        await invoke("patch_channel_banner_url", { channelId: channel.id, bannerFileId: up.file_id });
      } else if (banner?.url && banner.url !== (channel.banner_url ?? "")) {
        await invoke("patch_channel_banner_url", { channelId: channel.id, bannerUrl: banner.url });
      }
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id
            ? {
                ...c,
                name,
                description: channel.is_category ? c.description : description || null,
                color,
                icon,
                custom_icon_svg: customIconSvg,
                banner_url: banner?.url ?? c.banner_url,
                forum_require_tag: forumRequireTag ?? c.forum_require_tag,
                nsfw,
                channel_type: switchType ?? c.channel_type,
              }
            : c
        )
      );
      if (selectedChannel?.id === channel.id) {
        selectChannel({ ...selectedChannel, name, color, icon, custom_icon_svg: customIconSvg });
      }
      setChannelSettingsModal(null);
    } catch (e) {
      setChannelSettingsError(String(e));
    } finally {
      setChannelSettingsSaving(false);
    }
  }

  async function handleDeleteChannelSettings() {
    if (!channelSettingsModal) return;
    const channelId = channelSettingsModal.id;
    setChannelSettingsDeleting(true);
    setChannelSettingsError(null);
    try {
      await invoke("delete_channel", { channelId });
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (selectedChannel?.id === channelId) {
        clearSelectedChannel();
      }
      setChannelSettingsModal(null);
    } catch (e) {
      setChannelSettingsError(String(e));
    } finally {
      setChannelSettingsDeleting(false);
    }
  }

  function openCreateChannelUnder(parentId: string | null, isCategory = false) {
    setChannelSettingsModal(null);
    setNewChannelParentId(parentId);
    setCreateIsCategory(isCategory);
    setShowCreateChannel(true);
    closeContextMenu();
  }

  return {
    showCreateChannel,
    setShowCreateChannel,
    newChannelParentId,
    setNewChannelParentId,
    createIsCategory,
    createChannelLoading,
    createChannelError,
    setCreateChannelError,
    editDescriptionChannel,
    setEditDescriptionChannel,
    editDescriptionValue,
    setEditDescriptionValue,
    channelSettingsModal,
    setChannelSettingsModal,
    channelSettingsSaving,
    channelSettingsDeleting,
    channelSettingsError,
    setChannelSettingsError,
    bannerEditChannel,
    setBannerEditChannel,
    handleRenameChannel,
    handleCreateChannel,
    createChannelForWizard,
    openEditDescription,
    handleSaveDescription,
    handleDeleteChannel,
    handleSaveBannerUrl,
    handleSaveChannelSettings,
    handleDeleteChannelSettings,
    openCreateChannelUnder,
    channelPermissionsTabActions,
    channelBansTabActions,
    channelTalkPowerTabActions,
  };
}
