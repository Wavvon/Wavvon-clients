import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClaimantVoiceStatus, StagingGroup } from "../types";
import type { VoiceMoveChannelOption } from "./VoiceMoveMenu";

interface Props {
  group: StagingGroup;
  destinationChannels: VoiceMoveChannelOption[];
  nameFor: (pubkey: string) => string;
  statusFor: (pubkey: string) => ClaimantVoiceStatus;
  onAssign: (pubkey: string, channelId: string) => void;
  onBulkAssign: (pubkeys: string[], channelId: string) => void;
}

/** One slot's (or the synthesized "Unassigned" bucket's) claimants — a
 *  per-claimant "Move to…" picker plus a bulk "Move all" for the whole
 *  group (events.md §7.5; v1 loops one `voice_move` per claimant, per the
 *  doc — the caller's `onBulkAssign` does the looping). */
export function StagingSlotGroup({
  group, destinationChannels, nameFor, statusFor, onAssign, onBulkAssign,
}: Props) {
  const { t } = useTranslation();
  const [bulkTarget, setBulkTarget] = useState(destinationChannels[0]?.id ?? "");
  const [rowTargets, setRowTargets] = useState<Record<string, string>>({});

  const rowTarget = (pubkey: string) => rowTargets[pubkey] ?? destinationChannels[0]?.id ?? "";

  function statusLabel(status: ClaimantVoiceStatus): string | null {
    if (status.kind === "in_voice") return t("events.staging.status.in_voice", { channel: status.channelName });
    if (status.kind === "assigned") return t("events.staging.status.assigned", { channel: status.channelName });
    return null;
  }

  const title = group.id === null ? t("events.staging.group.unassigned") : group.name;
  const fill =
    group.capacity !== null
      ? t("events.slots.fill", { claimed: group.claimed, capacity: group.capacity })
      : group.id !== null
        ? t("events.slots.fill_unlimited", { claimed: group.claimed })
        : null;

  return (
    <div className="settings-section" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
          {title}
          {fill && <span className="muted" style={{ fontWeight: 400 }}> ({fill})</span>}
        </div>
        {destinationChannels.length > 0 && group.claimants.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
              style={{ fontSize: "var(--text-xs)" }}
              aria-label={t("events.staging.move_all", { group: title })}
            >
              {destinationChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
              onClick={() => onBulkAssign(group.claimants, bulkTarget)}
              disabled={!bulkTarget}
            >
              {t("events.staging.move_all", { group: title })}
            </button>
          </div>
        )}
      </div>

      {group.claimants.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("events.staging.no_claimants")}</p>
      ) : (
        group.claimants.map((pubkey) => {
          const status = statusFor(pubkey);
          const label = statusLabel(status);
          return (
            <div
              key={pubkey}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: "var(--text-xs)", flexWrap: "wrap" }}
            >
              <div>
                <span>{nameFor(pubkey)}</span>
                {label && <span className="muted"> — {label}</span>}
              </div>
              {destinationChannels.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={rowTarget(pubkey)}
                    onChange={(e) => setRowTargets((prev) => ({ ...prev, [pubkey]: e.target.value }))}
                    style={{ fontSize: "var(--text-xs)" }}
                    aria-label={t("events.staging.move")}
                  >
                    {destinationChannels.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                    onClick={() => onAssign(pubkey, rowTarget(pubkey))}
                    disabled={!rowTarget(pubkey)}
                  >
                    {t("events.staging.move")}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
