import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap, CreateHubWizard } from "@wavvon/ui";
import { CreateHubSelfHost } from "./CreateHubSelfHost";
import type { Hub } from "@shared/types";
import type { WsHandlers } from "@platform";
import { probeFarm, getFarmHubQuota, createHubOnFarm, addHub } from "@platform";

interface KnownFarm {
  url: string;
  name: string;
}

interface Props {
  knownFarms: KnownFarm[];
  wsHandlers: WsHandlers;
  onHubCreated: (hub: Hub) => void;
  discoveryNewUrl: string;
  setupCommand: string;
  inviteValue: string;
  onInviteChange: (v: string) => void;
  inviteLoading: boolean;
  inviteError: string | null;
  onRedeemInvite: () => void;
  onClose: () => void;
}

// The client can't spawn a hub process, so "Create a hub" is a router with
// two exits: self-host (buildable now, docs/docs/hub-creation-wizard.md §4)
// and a hosting farm (only offered when one is actually reachable — no
// dead option ships).
export function CreateHubFork({
  knownFarms,
  wsHandlers,
  onHubCreated,
  discoveryNewUrl,
  setupCommand,
  inviteValue,
  onInviteChange,
  inviteLoading,
  inviteError,
  onRedeemInvite,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const hasFarms = knownFarms.length > 0;
  const [mode, setMode] = useState<"choose" | "self-host" | "farm">(
    hasFarms ? "choose" : "self-host",
  );

  if (mode === "farm") {
    return (
      <CreateHubWizard
        knownFarms={knownFarms}
        onProbeFarm={probeFarm}
        onGetFarmHubQuota={getFarmHubQuota}
        onCreateHubOnFarm={createHubOnFarm}
        onAddHub={(hubUrl) => addHub(hubUrl, wsHandlers)}
        onHubCreated={onHubCreated}
        onClose={onClose}
      />
    );
  }

  if (mode === "self-host") {
    return (
      <CreateHubSelfHost
        discoveryNewUrl={discoveryNewUrl}
        setupCommand={setupCommand}
        inviteValue={inviteValue}
        onInviteChange={onInviteChange}
        inviteLoading={inviteLoading}
        inviteError={inviteError}
        onRedeemInvite={onRedeemInvite}
        onBack={hasFarms ? () => setMode("choose") : undefined}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-hub-fork-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="create-hub-fork-title">{t("create_hub.choose.title")}</h3>
          <p className="muted">{t("create_hub.choose.hint")}</p>
          <div className="settings-section" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <button className="btn-secondary" onClick={() => setMode("self-host")}>
              {t("create_hub.choose.self_host")}
            </button>
            <button className="btn-secondary" onClick={() => setMode("farm")}>
              {t("create_hub.choose.farm")}
            </button>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
