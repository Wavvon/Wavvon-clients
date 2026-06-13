import { activeSession } from "../session";

export function sendComponentInteraction(
  messageId: string,
  customId: string,
  values: string[],
): void {
  const { ws } = activeSession();
  if (ws) {
    ws.send({ type: "component_interaction", message_id: messageId, custom_id: customId, values });
  }
}
