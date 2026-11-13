import { hubFetch } from "../http";
import type { WidgetSettings } from "@wavvon/ui";

export async function getWidget(): Promise<WidgetSettings> {
  return (await hubFetch("/admin/settings/widget")).json() as Promise<WidgetSettings>;
}

export async function putWidget(settings: WidgetSettings): Promise<WidgetSettings> {
  const res = await hubFetch("/admin/settings/widget", { method: "PUT", body: JSON.stringify(settings) });
  return res.json() as Promise<WidgetSettings>;
}
