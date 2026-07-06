import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Friend } from "../types";

interface UseFriendsParams {
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useFriends({ setError, setToast }: UseFriendsParams) {
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingFriends, setPendingFriends] = useState<Friend[]>([]);
  const [friendRequestKey, setFriendRequestKey] = useState("");
  const [friendRequestHubUrl, setFriendRequestHubUrl] = useState("");

  async function refreshFriends() {
    try {
      const f = await invoke<Friend[]>("list_friends");
      const p = await invoke<Friend[]>("list_pending_friends");
      setFriends(f);
      setPendingFriends(p);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openFriends() {
    setShowFriends(true);
    await refreshFriends();
  }

  async function handleSendFriendRequest() {
    const key = friendRequestKey.trim();
    if (!key) return;
    const url = friendRequestHubUrl.trim();
    try {
      await invoke("send_friend_request", {
        targetPublicKey: key,
        friendHubUrl: url ? url : null,
        displayName: null,
      });
      setFriendRequestKey("");
      setFriendRequestHubUrl("");
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAcceptFriend(fromKey: string) {
    try {
      await invoke("accept_friend", { fromPublicKey: fromKey });
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveFriend(targetKey: string) {
    try {
      await invoke("remove_friend", { targetPublicKey: targetKey });
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUserAddFriend(publicKey: string, selfPublicKey: string | null, displayName: string) {
    if (publicKey === selfPublicKey) return;
    try {
      await invoke("send_friend_request", { targetPublicKey: publicKey });
      setToast(`Friend request sent to ${displayName}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return {
    showFriends,
    setShowFriends,
    friends,
    pendingFriends,
    friendRequestKey,
    setFriendRequestKey,
    friendRequestHubUrl,
    setFriendRequestHubUrl,
    refreshFriends,
    openFriends,
    handleSendFriendRequest,
    handleAcceptFriend,
    handleRemoveFriend,
    handleUserAddFriend,
  };
}
