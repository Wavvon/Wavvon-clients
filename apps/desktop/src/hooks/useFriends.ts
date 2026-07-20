import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseFriendsParams {
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useFriends({ setError, setToast }: UseFriendsParams) {
  const [showFriends, setShowFriends] = useState(false);

  function openFriends() {
    setShowFriends(true);
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
    openFriends,
    handleUserAddFriend,
  };
}
