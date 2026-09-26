import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseHubInput } from "@wavvon/core";
import type { Hub, LobbyStatus } from "../types";

export type HubPreviewState =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "ok";
      url: string;
      name: string;
      description?: string | null;
      icon?: string | null;
      invite_only?: boolean;
      min_security_level?: number;
      challenge_mode?: string | null;
    }
  | { state: "error"; message: string };

interface UseAddHubFlowParams {
  showWelcome: boolean;
  publicKey: string | null;
  activeHubId: string | null;
  setHubs: (hubs: Hub[]) => void;
  setActiveHubId: (id: string) => void;
  setPublicKey: (key: string) => void;
  setHubScope: (updater: (prev: Record<string, "lobby" | "member">) => Record<string, "lobby" | "member">) => void;
  setPendingSurveyHubId: (id: string) => void;
  setError: (msg: string | null) => void;
}

export function useAddHubFlow({
  showWelcome,
  publicKey,
  activeHubId,
  setHubs,
  setActiveHubId,
  setPublicKey,
  setHubScope,
  setPendingSurveyHubId,
  setError,
}: UseAddHubFlowParams) {
  const [showAddHub, setShowAddHub] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hubUrl, setHubUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [admissionChallenge, setAdmissionChallenge] = useState<{
    hubUrl: string;
    pubkey: string;
    resolvedUrl: string;
  } | null>(null);
  const [hubPreview, setHubPreview] = useState<HubPreviewState>({ state: "idle" });

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    const parsed = parseHubInput(v);
    if (parsed?.inviteCode) setInviteCode(parsed.inviteCode);
  }

  // On mount: check whether the app was launched via a wavvon:// deep link,
  // and listen for deep links opened while the app is already running.
  useEffect(() => {
    invoke<string | null>("get_pending_deep_link").then((url) => {
      if (!url) return;
      const parsed = parseHubInput(url);
      if (parsed) {
        setHubUrl(parsed.hubUrl);
        setInviteCode(parsed.inviteCode);
        setShowAddHub(true);
      }
    });
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    listen<string>("join-hub-requested", (event) => {
      const parsed = parseHubInput(event.payload);
      if (parsed) {
        setHubUrl(parsed.hubUrl);
        setInviteCode(parsed.inviteCode);
        setShowAddHub(true);
      }
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  // Debounced fetch of /info while the user types a hub URL.
  useEffect(() => {
    if (!showAddHub && !showWelcome) {
      setHubPreview({ state: "idle" });
      return;
    }
    const parsed = parseHubInput(hubUrl);
    if (!parsed) {
      setHubPreview({ state: "idle" });
      return;
    }
    const resolvedUrl = parsed.hubUrl;
    let cancelled = false;
    setHubPreview({ state: "loading" });
    const handle = setTimeout(async () => {
      try {
        const info = await invoke<{
          name: string;
          description?: string | null;
          icon?: string | null;
          invite_only?: boolean;
          min_security_level?: number;
          challenge_mode?: string | null;
        }>("preview_hub_info", { url: resolvedUrl });
        if (!cancelled) {
          setHubPreview({
            state: "ok",
            url: resolvedUrl,
            name: info.name,
            description: info.description,
            icon: info.icon,
            invite_only: info.invite_only,
            min_security_level: info.min_security_level,
            challenge_mode: info.challenge_mode,
          });
        }
      } catch (e) {
        if (!cancelled) setHubPreview({ state: "error", message: String(e) });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [hubUrl, showAddHub, showWelcome]);

  async function handleAddHub(challengeToken?: string) {
    setLoading(true);
    setError(null);
    try {
      const resolvedUrl = parseHubInput(hubUrl)?.hubUrl ?? hubUrl;

      if (!challengeToken && hubPreview.state === "ok" && hubPreview.challenge_mode && hubPreview.challenge_mode !== "off") {
        if (!publicKey) {
          setError("Identity not loaded yet. Try again in a moment.");
          return;
        }
        setAdmissionChallenge({ hubUrl: resolvedUrl, pubkey: publicKey, resolvedUrl });
        return;
      }

      const hub = await invoke<Hub>("add_hub", {
        hubUrl: resolvedUrl,
        inviteCode: inviteCode.trim() || null,
        challengeToken: challengeToken ?? null,
      });
      const allHubs = await invoke<Hub[]>("list_hubs");
      setHubs(allHubs);
      if (!publicKey) {
        try {
          const key = await invoke<string>("get_my_public_key");
          setPublicKey(key);
        } catch {}
      }
      if (!activeHubId) setActiveHubId(hub.hub_id);
      setShowAddHub(false);
      setHubUrl("");
      setInviteCode("");
      setAdmissionChallenge(null);
      // Publish to every connected hub (the command loops all sessions) —
      // the startup-only publish misses hubs joined mid-session, leaving
      // DMs on them plaintext-inbound / undecryptable-outbound until the
      // next app restart (same bug class as web's welcome-join, 2026-07-26).
      invoke("publish_dh_key").catch(() => {});

      try {
        const status = await invoke<LobbyStatus>("lobby_status", { hubUrl: resolvedUrl });
        if (status.status === "lobby") {
          setHubScope((prev) => ({ ...prev, [hub.hub_id]: "lobby" }));
        } else {
          const survey = await invoke<{ id: string } | null>("survey_current", { hubUrl: resolvedUrl });
          if (survey) {
            setPendingSurveyHubId(hub.hub_id);
          }
        }
      } catch {
        // lobby/survey check is best-effort
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return {
    showAddHub,
    setShowAddHub,
    loading,
    setLoading,
    hubUrl,
    setHubUrl,
    inviteCode,
    setInviteCode,
    admissionChallenge,
    setAdmissionChallenge,
    hubPreview,
    handleHubUrlChange,
    handleAddHub,
  };
}
