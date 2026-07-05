import { useState } from "react";
import {
  listAlliances,
  listAllianceSharedChannels,
  getAllianceChannelMessages,
  sendAllianceChannelMessage,
} from "@platform";
import { HubApiError } from "../platform/http";
import type { AllianceInfo, AllianceSharedChannel, Message } from "@shared/types";

export interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

export interface AlliancesReturn {
  userAlliances: AllianceInfo[];
  setUserAlliances: React.Dispatch<React.SetStateAction<AllianceInfo[]>>;
  allianceChannels: Record<string, AllianceSharedChannel[]>;
  setAllianceChannels: React.Dispatch<React.SetStateAction<Record<string, AllianceSharedChannel[]>>>;
  selectedAllianceChannel: SelectedAllianceChannel | null;
  allianceMessages: Message[];
  loadAlliances: () => Promise<void>;
  selectAllianceChannel: (alliance: AllianceInfo, channel: AllianceSharedChannel) => Promise<void>;
  clearSelectedAllianceChannel: () => void;
  sendAllianceMessage: (content: string) => Promise<void>;
}

export function useAlliances(setError: (msg: string) => void): AlliancesReturn {
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels, setAllianceChannels] = useState<Record<string, AllianceSharedChannel[]>>({});
  const [selectedAllianceChannel, setSelectedAllianceChannel] = useState<SelectedAllianceChannel | null>(null);
  const [allianceMessages, setAllianceMessages] = useState<Message[]>([]);

  async function loadAlliances() {
    try {
      const al = await listAlliances();
      setUserAlliances(al);
      const byId: Record<string, AllianceSharedChannel[]> = {};
      await Promise.all(
        al.map(async (a) => {
          try {
            byId[a.id] = await listAllianceSharedChannels(a.id);
          } catch {
            byId[a.id] = [];
          }
        })
      );
      setAllianceChannels(byId);
    } catch {
      setUserAlliances([]);
      setAllianceChannels({});
    }
  }

  function clearSelectedAllianceChannel() {
    setSelectedAllianceChannel(null);
    setAllianceMessages([]);
  }

  async function selectAllianceChannel(alliance: AllianceInfo, channel: AllianceSharedChannel) {
    setSelectedAllianceChannel({ alliance_id: alliance.id, alliance_name: alliance.name, channel });
    setAllianceMessages([]);
    try {
      setAllianceMessages(await getAllianceChannelMessages(alliance.id, channel.channel_id));
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  async function sendAllianceMessage(content: string) {
    if (!selectedAllianceChannel) return;
    const text = content.trim();
    if (!text) return;
    const { alliance_id, channel } = selectedAllianceChannel;
    try {
      await sendAllianceChannelMessage(alliance_id, channel.channel_id, text);
      setAllianceMessages(await getAllianceChannelMessages(alliance_id, channel.channel_id));
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  return {
    userAlliances,
    setUserAlliances,
    allianceChannels,
    setAllianceChannels,
    selectedAllianceChannel,
    allianceMessages,
    loadAlliances,
    selectAllianceChannel,
    clearSelectedAllianceChannel,
    sendAllianceMessage,
  };
}
