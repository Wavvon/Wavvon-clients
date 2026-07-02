import { hubFetch } from "../http";
import type {
  EventSubscription,
  OutgoingWebhookCreatedResult,
  OutgoingWebhookDelivery,
  OutgoingWebhookSummary,
} from "../../types";

export async function adminListOutgoingWebhooks(): Promise<OutgoingWebhookSummary[]> {
  const res = await hubFetch("/admin/outgoing-webhooks");
  return res.json() as Promise<OutgoingWebhookSummary[]>;
}

export async function adminCreateOutgoingWebhook(
  url: string,
  displayName: string | null,
): Promise<OutgoingWebhookCreatedResult> {
  const res = await hubFetch("/admin/outgoing-webhooks", {
    method: "POST",
    body: JSON.stringify({ url, display_name: displayName }),
  });
  return res.json() as Promise<OutgoingWebhookCreatedResult>;
}

export async function adminUpdateOutgoingWebhook(
  id: string,
  patch: { url?: string; display_name?: string; active?: boolean },
): Promise<void> {
  await hubFetch(`/admin/outgoing-webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminDeleteOutgoingWebhook(id: string): Promise<void> {
  await hubFetch(`/admin/outgoing-webhooks/${id}`, { method: "DELETE" });
}

export async function adminSetOutgoingWebhookSubscriptions(
  id: string,
  subscriptions: EventSubscription[],
): Promise<{ count: number }> {
  const res = await hubFetch(`/admin/outgoing-webhooks/${id}/subscriptions`, {
    method: "PUT",
    body: JSON.stringify({ subscriptions }),
  });
  return res.json() as Promise<{ count: number }>;
}

export async function adminGetOutgoingWebhookSubscriptions(
  id: string,
): Promise<EventSubscription[]> {
  const res = await hubFetch(`/admin/outgoing-webhooks/${id}/subscriptions`);
  const body = (await res.json()) as { subscriptions: EventSubscription[] };
  return body.subscriptions;
}

export async function adminRotateOutgoingWebhookSecret(id: string): Promise<{ secret: string }> {
  const res = await hubFetch(`/admin/outgoing-webhooks/${id}/rotate-secret`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return res.json() as Promise<{ secret: string }>;
}

export async function adminEnableOutgoingWebhook(id: string): Promise<void> {
  await hubFetch(`/admin/outgoing-webhooks/${id}/enable`, { method: "POST", body: JSON.stringify({}) });
}

export interface ListDeliveriesParams {
  limit?: number;
  offset?: number;
  eventType?: string;
  success?: boolean;
}

export async function adminListOutgoingWebhookDeliveries(
  id: string,
  params: ListDeliveriesParams = {},
): Promise<OutgoingWebhookDelivery[]> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.eventType) query.set("event_type", params.eventType);
  if (params.success != null) query.set("success", String(params.success));
  const qs = query.toString();
  const res = await hubFetch(`/admin/outgoing-webhooks/${id}/deliveries${qs ? `?${qs}` : ""}`);
  return res.json() as Promise<OutgoingWebhookDelivery[]>;
}
