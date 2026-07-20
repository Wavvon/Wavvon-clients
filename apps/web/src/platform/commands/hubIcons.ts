import { hubFetch } from "../http";
import type { HubIcon } from "@wavvon/ui";

export type { HubIcon };

// Hub SVG icon library (MANAGE_HUB_ICONS to write).
export async function listHubIcons(): Promise<HubIcon[]> {
  const r = await hubFetch("/hub/icons");
  return r.json() as Promise<HubIcon[]>;
}

export async function createHubIcon(name: string, svgContent: string): Promise<HubIcon> {
  const r = await hubFetch("/hub/icons", {
    method: "POST",
    body: JSON.stringify({ name, svg_content: svgContent }),
  });
  return r.json() as Promise<HubIcon>;
}

export async function renameHubIcon(iconId: string, name: string): Promise<void> {
  await hubFetch(`/hub/icons/${iconId}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function deleteHubIcon(iconId: string): Promise<void> {
  await hubFetch(`/hub/icons/${iconId}`, { method: "DELETE" });
}
