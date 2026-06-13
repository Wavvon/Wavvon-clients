import { useState, useCallback } from "react";
import type { ComponentRow, BotButton, BotSelect } from "../types";
import { activeSession } from "../platform/session";

interface Props {
  rows: ComponentRow[];
  messageId: string;
  hubUrl: string;
  onInteract: (messageId: string, customId: string, values: string[]) => void;
}

export function MessageComponents({ rows, messageId, onInteract }: Props) {
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());

  const fireInteraction = useCallback(
    (customId: string, values: string[]) => {
      setDisabledIds((prev) => new Set(prev).add(customId));

      const timer = setTimeout(() => {
        setDisabledIds((prev) => {
          const next = new Set(prev);
          next.delete(customId);
          return next;
        });
      }, 5000);

      try {
        const { ws } = activeSession();
        if (ws) {
          ws.send({ type: "component_interaction", message_id: messageId, custom_id: customId, values });
        }
      } catch {
        clearTimeout(timer);
        setDisabledIds((prev) => {
          const next = new Set(prev);
          next.delete(customId);
          return next;
        });
      }

      onInteract(messageId, customId, values);
    },
    [messageId, onInteract],
  );

  if (!rows.length) return null;
  return (
    <div className="message-components">
      {rows.map((row, ri) => (
        <div key={ri} className="component-row">
          {row.components.map((c, ci) => {
            if (c.type === "button") {
              const btn = c as BotButton;
              const isDisabled = btn.disabled || disabledIds.has(btn.custom_id);
              return (
                <button
                  key={ci}
                  className={`component-btn component-btn--${btn.style ?? "secondary"}`}
                  disabled={isDisabled}
                  onClick={() => fireInteraction(btn.custom_id, [])}
                >
                  {btn.label}
                </button>
              );
            }
            if (c.type === "select") {
              const sel = c as BotSelect;
              const isDisabled = disabledIds.has(sel.custom_id);
              return (
                <select
                  key={ci}
                  className="component-select"
                  disabled={isDisabled}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) fireInteraction(sel.custom_id, [e.target.value]);
                  }}
                >
                  <option value="" disabled>{sel.placeholder ?? "Select…"}</option>
                  {sel.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
