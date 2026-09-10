import type { OutgoingWebhookActions } from "@wavvon/ui";
import {
  adminListOutgoingWebhooks,
  adminCreateOutgoingWebhook,
  adminUpdateOutgoingWebhook,
  adminDeleteOutgoingWebhook,
  adminGetOutgoingWebhookSubscriptions,
  adminSetOutgoingWebhookSubscriptions,
  adminRotateOutgoingWebhookSecret,
  adminEnableOutgoingWebhook,
  adminListOutgoingWebhookDeliveries,
} from "../../platform/commands/outgoingWebhooks";

// Module-level: the section loads on mount, and a fresh object every render
// would reload it every render.
export const outgoingWebhookActions: OutgoingWebhookActions = {
  list: adminListOutgoingWebhooks,
  create: adminCreateOutgoingWebhook,
  update: adminUpdateOutgoingWebhook,
  remove: adminDeleteOutgoingWebhook,
  getSubscriptions: adminGetOutgoingWebhookSubscriptions,
  setSubscriptions: adminSetOutgoingWebhookSubscriptions,
  rotateSecret: adminRotateOutgoingWebhookSecret,
  enable: adminEnableOutgoingWebhook,
  listDeliveries: adminListOutgoingWebhookDeliveries,
};
