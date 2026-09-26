import { useRef, useState } from "react";
import type { RefObject } from "react";
import { parseHubInput } from "@wavvon/core";
import type { HubInputResult } from "@wavvon/core";
import {
  addHub, listHubs, previewHubInfo, verifyLanFingerprint, authenticateWithPasskey,
  publishDhKey, HubApiError,
} from "@platform";
import type { WsHandlers } from "@platform";
import type { Hub } from "@shared/types";

export type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; welcome_label?: string | null; welcome_invite_url?: string | null }
  | { state: "error"; message: string };

export interface UseAddHubFlowParams {
  publicKey: string | null;
  stableHandlers: WsHandlers;
  hubsRef: RefObject<Hub[]>;
  setHubs: (hubs: Hub[]) => void;
  setActiveHubIdState: (id: string) => void;
  loadHubData: () => Promise<void>;
  applyDeepLinkTarget: (hubId: string, target: NonNullable<HubInputResult["target"]>) => Promise<void>;
  t: (key: string) => string;
}

// Add-hub flow: URL/invite input parsing (incl. wavvon:// deep links and LAN
// fingerprint pinning per lan-mode.md §5), preview, and the two join paths
// (session token, passkey). Shared by AddHubModal's "join" field and the
// create-hub self-host panel's "paste your owner invite" field.
export function useAddHubFlow({
  publicKey, stableHandlers, hubsRef, setHubs, setActiveHubIdState, loadHubData,
  applyDeepLinkTarget, t,
}: UseAddHubFlowParams) {
  const [hubUrl, setHubUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hubPreview, setHubPreview] = useState<HubPreview>({ state: "idle" });
  const [addingHub, setAddingHub] = useState(false);
  const [addHubError, setAddHubError] = useState<string | null>(null);
  // LAN fingerprint pinning (lan-mode.md §5): set when the parsed invite
  // carried a `?fp=`/`#fp=` fingerprint, so handleAddHub* can TOFU-verify it
  // against /info before joining.
  const [expectedFingerprint, setExpectedFingerprint] = useState<string | undefined>(undefined);
  const [fingerprintMatch, setFingerprintMatch] = useState(false);
  const [showAddHub, setShowAddHub] = useState(false);
  const pendingDeepLinkTargetRef = useRef<NonNullable<HubInputResult["target"]> | null>(null);

  // Matches a wavvon:// deep-link host against an already-joined hub
  // (nested-channels-ux.md §1.5).
  function findHubByUrl(url: string): Hub | undefined {
    let host: string;
    try { host = new URL(url).host.toLowerCase(); } catch { return undefined; }
    return hubsRef.current.find((h) => {
      try { return new URL(h.hub_url).host.toLowerCase() === host; } catch { return false; }
    });
  }

  // Shared by AddHubModal's "join" field and the create-hub self-host
  // panel's "paste your owner invite" field — both resolve through the
  // same parseHubInput + handleAddHub path, so a redeemed owner invite
  // (grant_role_id carrying ownership) lands the user in-hub already
  // owning it, same as any other invite redemption.
  function handleHubUrlInput(v: string) {
    const p = parseHubInput(v);
    setHubUrl(p?.hubUrl ?? v);
    if (p?.inviteCode) setInviteCode(p.inviteCode);
    setExpectedFingerprint(p?.fingerprint);
    setFingerprintMatch(false);
    setHubPreview({ state: "idle" });
    setAddHubError(null);
    if (p?.target) {
      const existing = findHubByUrl(p.hubUrl);
      if (existing) {
        pendingDeepLinkTargetRef.current = null;
        setShowAddHub(false);
        void applyDeepLinkTarget(existing.hub_id, p.target);
        return;
      }
      pendingDeepLinkTargetRef.current = p.target;
    } else {
      pendingDeepLinkTargetRef.current = null;
    }
  }

  async function handlePreviewHub() {
    setHubPreview({ state: "loading" });
    setAddHubError(null);
    try {
      const info = await previewHubInfo(hubUrl);
      setHubPreview({ state: "ok", url: hubUrl, name: info.name, icon: info.icon, welcome_label: info.welcome_label, welcome_invite_url: info.welcome_invite_url });
    } catch (e) {
      setHubPreview({ state: "error", message: String(e) });
    }
  }

  // Also the join path a redeemed owner invite takes from the "Create a
  // hub" self-host handoff (docs/docs/hub-creation-wizard.md §4) — no
  // separate join mechanism for that flow.
  async function handleAddHub() {
    setAddingHub(true);
    setAddHubError(null);
    try {
      if (!(await verifyLanFingerprint(hubUrl, expectedFingerprint))) {
        setAddHubError(t("hub.add_modal.fingerprint_mismatch"));
        return;
      }
      if (expectedFingerprint) setFingerprintMatch(true);
      const hub = await addHub(hubUrl, stableHandlers, { invite_code: inviteCode || undefined });
      setHubs(listHubs());
      setActiveHubIdState(hub.hub_id);
      setShowAddHub(false);
      setHubUrl("");
      setInviteCode("");
      setHubPreview({ state: "idle" });
      await loadHubData();
      publishDhKey().catch(() => {});
      const target = pendingDeepLinkTargetRef.current;
      if (target) {
        pendingDeepLinkTargetRef.current = null;
        await applyDeepLinkTarget(hub.hub_id, target);
      }
    } catch (e) {
      setAddHubError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setAddingHub(false);
    }
  }

  async function handleAddHubWithPasskey() {
    if (!publicKey) return;
    setAddingHub(true);
    setAddHubError(null);
    try {
      if (!(await verifyLanFingerprint(hubUrl, expectedFingerprint))) {
        setAddHubError(t("hub.add_modal.fingerprint_mismatch"));
        return;
      }
      if (expectedFingerprint) setFingerprintMatch(true);
      const token = await authenticateWithPasskey(hubUrl, publicKey);
      const hub = await addHub(hubUrl, stableHandlers, {
        invite_code: inviteCode || undefined,
        sessionToken: token,
      });
      setHubs(listHubs());
      setActiveHubIdState(hub.hub_id);
      setShowAddHub(false);
      setHubUrl("");
      setInviteCode("");
      setHubPreview({ state: "idle" });
      await loadHubData();
      publishDhKey().catch(() => {});
      const target = pendingDeepLinkTargetRef.current;
      if (target) {
        pendingDeepLinkTargetRef.current = null;
        await applyDeepLinkTarget(hub.hub_id, target);
      }
    } catch (e) {
      setAddHubError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setAddingHub(false);
    }
  }

  return {
    hubUrl, setHubUrl,
    inviteCode, setInviteCode,
    hubPreview, setHubPreview,
    addingHub,
    addHubError, setAddHubError,
    expectedFingerprint,
    fingerprintMatch, setFingerprintMatch,
    showAddHub, setShowAddHub,
    pendingDeepLinkTargetRef,
    handleHubUrlInput,
    handlePreviewHub,
    handleAddHub,
    handleAddHubWithPasskey,
    findHubByUrl,
  };
}
