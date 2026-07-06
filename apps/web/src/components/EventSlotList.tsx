import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventSlot } from "../types";
import { rsvpEvent } from "@platform";
import { HubApiError } from "../platform/http";
import { canClaimSlot, isClaimedByMe, isSlotFull } from "../utils/events";

interface Props {
  eventId: string;
  slots: EventSlot[];
  myPubkey: string | null;
  onSlotsChange: (slots: EventSlot[]) => void;
}

function shortPubkey(pubkey: string): string {
  return pubkey.slice(0, 8) + "…";
}

// Applies a claim/unclaim result to the local slot list without a refetch:
// adding myPubkey to `targetSlotId` (or removing it entirely for unclaim)
// and dropping it from any other slot, since a user can only hold one claim
// per event (hub/src/routes/events.rs rsvp_event).
function applyClaim(slots: EventSlot[], myPubkey: string, targetSlotId: string | null): EventSlot[] {
  return slots.map((s) => {
    if (s.id === targetSlotId) {
      const claimants = s.claimants.includes(myPubkey) ? s.claimants : [...s.claimants, myPubkey];
      return { ...s, claimants, claimed: claimants.length };
    }
    if (s.claimants.includes(myPubkey)) {
      const claimants = s.claimants.filter((p) => p !== myPubkey);
      return { ...s, claimants, claimed: claimants.length };
    }
    return s;
  });
}

export function EventSlotList({ eventId, slots, myPubkey, onSlotsChange }: Props) {
  const { t } = useTranslation();
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(slot: EventSlot) {
    if (!myPubkey || pendingSlotId) return;
    setError(null);
    setPendingSlotId(slot.id);
    try {
      await rsvpEvent(eventId, "going", slot.id);
      onSlotsChange(applyClaim(slots, myPubkey, slot.id));
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setPendingSlotId(null);
    }
  }

  async function handleUnclaim(slot: EventSlot) {
    if (!myPubkey || pendingSlotId) return;
    setError(null);
    setPendingSlotId(slot.id);
    try {
      await rsvpEvent(eventId, "going");
      onSlotsChange(applyClaim(slots, myPubkey, null));
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setPendingSlotId(null);
    }
  }

  if (slots.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div className="settings-label" style={{ marginBottom: 4 }}>
        {t("events.slots.title")}
      </div>
      {slots.map((slot) => {
        const mine = isClaimedByMe(slot, myPubkey);
        const full = isSlotFull(slot);
        const disabled = pendingSlotId === slot.id || (!mine && !canClaimSlot(slot, myPubkey));
        return (
          <div
            key={slot.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 0",
              fontSize: "var(--text-xs)",
              fontWeight: mine ? 600 : undefined,
            }}
          >
            <div>
              <span>
                {slot.capacity === null
                  ? t("events.slots.fill_unlimited", { claimed: slot.claimed })
                  : t("events.slots.fill", { claimed: slot.claimed, capacity: slot.capacity })}
              </span>{" "}
              <span>{slot.name}</span>
              {slot.claimants.length > 0 && (
                <span className="muted">
                  {" — "}
                  {slot.claimants
                    .map((p) => (p === myPubkey ? t("events.slots.you") : shortPubkey(p)))
                    .join(", ")}
                </span>
              )}
            </div>
            {myPubkey && (
              <button
                className={mine ? "btn-primary" : "btn-secondary"}
                style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                disabled={disabled}
                onClick={() => (mine ? handleUnclaim(slot) : handleClaim(slot))}
              >
                {mine ? t("events.slots.unclaim") : full ? t("events.slots.full") : t("events.slots.claim")}
              </button>
            )}
          </div>
        );
      })}
      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
