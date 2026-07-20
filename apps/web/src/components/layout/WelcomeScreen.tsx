import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addHub, previewHubInfo, verifyLanFingerprint } from "@platform";
import type { WsHandlers } from "@platform";
import type { Hub } from "@shared/types";
import { parseHubInput } from "@wavvon/core";
import type { HubInputResult } from "@wavvon/core";
import { WelcomeScreen } from "@wavvon/ui";

type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; challenge_mode?: string | null; welcome_label?: string | null; welcome_invite_url?: string | null }
  | { state: "error"; message: string };

// Standalone stateful wrapper used when rendered from App.tsx.
interface WelcomeScreenContainerProps {
  wsHandlers: WsHandlers;
  /** target is set when hubUrl was pasted from a channel/message permalink. */
  onHubAdded: (hub: Hub, target?: HubInputResult["target"]) => void;
  initialHubUrl?: string;
  onBrowse?: () => void;
}

export function WelcomeScreenContainer({ wsHandlers, onHubAdded, initialHubUrl, onBrowse }: WelcomeScreenContainerProps) {
  const { t } = useTranslation();
  const [hubUrl, setHubUrl] = useState(initialHubUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hubPreview, setHubPreview] = useState<HubPreview>({ state: "idle" });

  useEffect(() => {
    const trimmed = hubUrl.trim();
    if (!trimmed) { setHubPreview({ state: "idle" }); return; }
    setHubPreview({ state: "loading" });
    const timer = setTimeout(async () => {
      try {
        const parsed = parseHubInput(trimmed);
        const cleanUrl = parsed?.hubUrl ?? trimmed;
        const info = await previewHubInfo(cleanUrl);
        setHubPreview({ state: "ok", url: cleanUrl, name: info.name, icon: info.icon, welcome_label: info.welcome_label, welcome_invite_url: info.welcome_invite_url });
      } catch (e) {
        setHubPreview({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [hubUrl]);

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    setError(null);
  }

  async function handleJoin() {
    if (!hubUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = parseHubInput(hubUrl.trim());
      const cleanUrl = parsed?.hubUrl ?? hubUrl.trim();
      const inviteCode = parsed?.inviteCode || undefined;
      if (!(await verifyLanFingerprint(cleanUrl, parsed?.fingerprint))) {
        throw new Error(t("hub.add_modal.fingerprint_mismatch"));
      }
      const hub = await addHub(cleanUrl, wsHandlers, inviteCode ? { invite_code: inviteCode } : undefined);
      onHubAdded(hub, parsed?.target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeScreen
      hubUrl={hubUrl}
      onHubUrlChange={handleHubUrlChange}
      hubPreview={hubPreview}
      loading={loading}
      error={error}
      onJoin={handleJoin}
      onBrowse={onBrowse}
      homeHubHint={initialHubUrl}
    />
  );
}
