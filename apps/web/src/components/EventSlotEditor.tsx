import { useTranslation } from "react-i18next";

export interface SlotRow {
  key: string;
  name: string;
  capacity: string;
}

interface Props {
  slots: SlotRow[];
  onAdd: () => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<SlotRow>) => void;
}

export function EventSlotEditor({ slots, onAdd, onRemove, onUpdate }: Props) {
  const { t } = useTranslation();

  return (
    <div className="settings-section" style={{ marginBottom: 10 }}>
      <label className="settings-label">{t("events.composer.slots_label")}</label>
      {slots.map((slot) => (
        <div key={slot.key} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            type="text"
            value={slot.name}
            onChange={(e) => onUpdate(slot.key, { name: e.target.value })}
            placeholder={t("events.composer.slot_name_placeholder")}
            style={{ flex: 2 }}
          />
          <input
            type="number"
            min={1}
            value={slot.capacity}
            onChange={(e) => onUpdate(slot.key, { capacity: e.target.value })}
            placeholder={t("events.composer.slot_capacity_placeholder")}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn-ghost"
            aria-label={t("events.composer.remove_slot")}
            onClick={() => onRemove(slot.key)}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={onAdd}>
        {t("events.composer.add_slot")}
      </button>
    </div>
  );
}
