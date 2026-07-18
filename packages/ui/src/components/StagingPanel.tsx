import React from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";
import { StagingSlotGroup } from "./StagingSlotGroup";
import type { ClaimantVoiceStatus, StagingGroup } from "../types";
import type { VoiceMoveChannelOption } from "./VoiceMoveMenu";

interface Props {
  eventTitle: string;
  groups: StagingGroup[];
  destinationChannels: VoiceMoveChannelOption[];
  nameFor: (pubkey: string) => string;
  statusFor: (pubkey: string) => ClaimantVoiceStatus;
  onAssign: (pubkey: string, channelId: string) => void;
  onBulkAssign: (pubkeys: string[], channelId: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

/** Organizer-only staging panel on an event card (events.md §7.5) — groups
 *  claimants by slot (plus a synthesized "Unassigned" bucket for plain
 *  "going" RSVPs) and offers a per-claimant "Move to…" picker plus a
 *  per-group bulk move. All voice/assignment lookups happen in the caller;
 *  this component only renders the `groups`/`statusFor` it's handed —
 *  gating on organizer + `move_members` is also the caller's job. */
export function StagingPanel({
  eventTitle, groups, destinationChannels, nameFor, statusFor, onAssign, onBulkAssign, loading, error, onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("events.staging.title", { event: eventTitle })}
    >
      <FocusTrap>
        <div className="modal" style={{ maxWidth: 520, width: "100%" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: "var(--text-md)" }}>
              {t("events.staging.title", { event: eventTitle })}
            </h3>
            <button className="btn-ghost" onClick={onClose} aria-label={t("events.staging.close")}>×</button>
          </div>

          {loading && <p className="muted">{t("events.staging.loading")}</p>}
          {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
          {!loading && !error && groups.length === 0 && (
            <p className="muted">{t("events.staging.empty")}</p>
          )}

          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {groups.map((group) => (
              <StagingSlotGroup
                key={group.id ?? "__unassigned"}
                group={group}
                destinationChannels={destinationChannels}
                nameFor={nameFor}
                statusFor={statusFor}
                onAssign={onAssign}
                onBulkAssign={onBulkAssign}
              />
            ))}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
