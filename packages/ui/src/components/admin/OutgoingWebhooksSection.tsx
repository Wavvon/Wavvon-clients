import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRelative } from "@wavvon/core";
import type { Channel } from "@wavvon/core";
import type {
  EventSubscription,
  OutgoingWebhookCreatedResult,
  OutgoingWebhookDelivery,
  OutgoingWebhookSummary,
} from "../../types";
import { EventSubscriptionEditor, eventSubscriptionsAreValid } from "../events/EventSubscriptionEditor";

/** Every hub call this section makes, injected — the same shape the other
 *  admin sections use, so the component itself has no transport. */
export interface OutgoingWebhookActions {
  list: () => Promise<OutgoingWebhookSummary[]>;
  create: (url: string, displayName: string | null) => Promise<OutgoingWebhookCreatedResult>;
  update: (
    id: string,
    patch: { url?: string; display_name?: string; active?: boolean },
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getSubscriptions: (id: string) => Promise<EventSubscription[]>;
  setSubscriptions: (id: string, subscriptions: EventSubscription[]) => Promise<{ count: number }>;
  rotateSecret: (id: string) => Promise<{ secret: string }>;
  enable: (id: string) => Promise<void>;
  listDeliveries: (
    id: string,
    params: { limit?: number; offset?: number; eventType?: string; success?: boolean },
  ) => Promise<OutgoingWebhookDelivery[]>;
}

interface Props {
  channels: Channel[];
  actions: OutgoingWebhookActions;
}

interface PanelState {
  expanded: boolean;
  subscriptions: EventSubscription[];
  subscriptionsLoaded: boolean;
  deliveriesLoaded: boolean;
  savingSubscriptions: boolean;
  deliveries: OutgoingWebhookDelivery[];
  deliveryEventFilter: string;
  deliverySuccessFilter: string;
  deliveryOffset: number;
  loadingDeliveries: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function emptyPanel(): PanelState {
  return {
    expanded: false,
    subscriptions: [],
    subscriptionsLoaded: false,
    deliveriesLoaded: false,
    savingSubscriptions: false,
    deliveries: [],
    deliveryEventFilter: "",
    deliverySuccessFilter: "",
    deliveryOffset: 0,
    loadingDeliveries: false,
  };
}

function SecretRevealDialog({
  title,
  warning,
  secret,
  onDismiss,
}: {
  title: string;
  warning: string;
  secret: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="bot-token-reveal">
      <p className="bot-token-warning">{title}</p>
      <p className="muted">{warning}</p>
      <code className="bot-token-value">{secret}</code>
      <div className="bot-token-actions">
        <button
          onClick={() => {
            navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? t("hub.admin.owh.secret.copied") : t("hub.admin.owh.secret.copy")}
        </button>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {t("hub.admin.owh.secret.confirm")}
      </label>
      <div className="bot-token-actions">
        <button className="btn-secondary" disabled={!confirmed} onClick={onDismiss}>
          {t("hub.admin.owh.secret.dismiss")}
        </button>
      </div>
    </div>
  );
}

export function OutgoingWebhooksSection({ channels, actions }: Props) {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = useState<OutgoingWebhookSummary[]>([]);
  const [url, setUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});

  const textChannels = channels.filter((c) => !c.is_category);

  async function loadWebhooks() {
    try {
      const list = await actions.list();
      setWebhooks(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    loadWebhooks();
  }, []);

  function panelFor(id: string): PanelState {
    return panels[id] ?? emptyPanel();
  }

  function updatePanel(id: string, patch: Partial<PanelState>) {
    setPanels((prev) => ({ ...prev, [id]: { ...panelFor(id), ...patch } }));
  }

  async function handleCreate() {
    if (!url.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedSecret(null);
    try {
      const result = await actions.create(url.trim(), displayName.trim() || null);
      setCreatedSecret(result.secret);
      setUrl("");
      setDisplayName("");
      await loadWebhooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("hub.admin.owh.delete_confirm"))) return;
    try {
      await actions.remove(id);
      await loadWebhooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleEnable(id: string) {
    try {
      await actions.enable(id);
      await loadWebhooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDisable(id: string) {
    try {
      await actions.update(id, { active: false });
      await loadWebhooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRotateSecret(id: string) {
    try {
      const result = await actions.rotateSecret(id);
      setRotatedSecret({ id, secret: result.secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function togglePanel(id: string) {
    const panel = panelFor(id);
    const expanded = !panel.expanded;
    updatePanel(id, { expanded });
    if (expanded && !panel.subscriptionsLoaded) {
      try {
        const subscriptions = await actions.getSubscriptions(id);
        updatePanel(id, { subscriptions, subscriptionsLoaded: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    if (expanded && !panel.deliveriesLoaded) {
      await loadDeliveries(id, { eventType: "", success: "", offset: 0, append: false });
      updatePanel(id, { deliveriesLoaded: true });
    }
  }

  async function saveSubscriptions(id: string) {
    const panel = panelFor(id);
    if (!eventSubscriptionsAreValid(panel.subscriptions)) {
      setError("Select at least one channel for message events before saving.");
      return;
    }
    updatePanel(id, { savingSubscriptions: true });
    setError(null);
    try {
      await actions.setSubscriptions(id, panel.subscriptions);
      await loadWebhooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      updatePanel(id, { savingSubscriptions: false });
    }
  }

  async function loadDeliveries(
    id: string,
    opts: { eventType: string; success: string; offset: number; append: boolean },
  ) {
    updatePanel(id, { loadingDeliveries: true });
    try {
      const rows = await actions.listDeliveries(id, {
        limit: 50,
        offset: opts.offset,
        eventType: opts.eventType || undefined,
        success: opts.success === "" ? undefined : opts.success === "true",
      });
      const panel = panelFor(id);
      updatePanel(id, {
        deliveries: opts.append ? [...panel.deliveries, ...rows] : rows,
        deliveryEventFilter: opts.eventType,
        deliverySuccessFilter: opts.success,
        deliveryOffset: opts.offset,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      updatePanel(id, { loadingDeliveries: false });
    }
  }

  function statusBadge(wh: OutgoingWebhookSummary) {
    if (!wh.active && wh.failure_count > 0) {
      return (
        <span
          className="status-badge status-badge-danger"
          onClick={() => togglePanel(wh.id)}
          title={t("hub.admin.owh.status.failed_title")}
        >
          {t("hub.admin.owh.status.failed")}
        </span>
      );
    }
    if (!wh.active) {
      return <span className="status-badge">{t("hub.admin.owh.status.disabled")}</span>;
    }
    return <span className="status-badge status-badge-success">{t("hub.admin.owh.status.active")}</span>;
  }

  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <h2>{t("hub.admin.tabs.outgoing_webhooks")}</h2>
      <p className="muted">{t("hub.admin.owh.hint")}</p>

      {error && <p className="muted" style={{ color: "var(--danger)", marginBottom: "var(--space-3)" }}>{error}</p>}

      <div className="settings-section">
        <label className="settings-label">URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/hooks/wavvon"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.owh.name_label")}</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("hub.admin.owh.name_placeholder")}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <button onClick={handleCreate} disabled={creating || !url.trim()}>
          {creating ? t("hub.admin.owh.adding") : t("hub.admin.owh.add")}
        </button>
      </div>

      {createdSecret && (
        <SecretRevealDialog
          title={t("hub.admin.owh.secret.created")}
          warning={t("hub.admin.owh.secret.warn_created")}
          secret={createdSecret}
          onDismiss={() => setCreatedSecret(null)}
        />
      )}

      {webhooks.length === 0 ? (
        <p className="muted">{t("hub.admin.owh.empty")}</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>{t("hub.admin.owh.col.name")}</th>
              <th>URL</th>
              <th>{t("hub.admin.owh.col.subscriptions")}</th>
              <th>{t("hub.admin.owh.col.status")}</th>
              <th>{t("hub.admin.owh.col.last_delivery")}</th>
              <th>{t("hub.admin.owh.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => {
              const panel = panelFor(wh.id);
              return (
                <React.Fragment key={wh.id}>
                  <tr>
                    <td>{wh.display_name || hostOf(wh.url)}</td>
                    <td><code className="muted" style={{ fontSize: "var(--text-xs)" }}>{hostOf(wh.url)}</code></td>
                    <td>{wh.subscription_count} event types</td>
                    <td>{statusBadge(wh)}</td>
                    <td>
                      {wh.last_delivery_at ? formatRelative(wh.last_delivery_at) : <span className="muted">—</span>}
                    </td>
                    <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button className="btn-small btn-secondary" onClick={() => togglePanel(wh.id)}>
                        {panel.expanded ? t("hub.admin.owh.hide") : t("hub.admin.owh.manage")}
                      </button>
                      <button className="btn-small btn-secondary danger" onClick={() => handleDelete(wh.id)}>
                        {t("hub.admin.owh.delete")}
                      </button>
                    </td>
                  </tr>
                  {panel.expanded && (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ padding: "var(--space-3)", background: "var(--bg-sunken)", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                          <div>
                            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                              {wh.active ? (
                                <button className="btn-small btn-secondary" onClick={() => handleDisable(wh.id)}>
                                  {t("hub.admin.owh.disable")}
                                </button>
                              ) : (
                                <button className="btn-small" onClick={() => handleEnable(wh.id)}>
                                  {t("hub.admin.owh.reenable")}
                                </button>
                              )}
                              <button className="btn-small btn-secondary" onClick={() => handleRotateSecret(wh.id)}>
                                {t("hub.admin.owh.rotate")}
                              </button>
                            </div>
                            {rotatedSecret?.id === wh.id && (
                              <SecretRevealDialog
                                title={t("hub.admin.owh.secret.rotated")}
                                warning={t("hub.admin.owh.secret.warn_rotated")}
                                secret={rotatedSecret.secret}
                                onDismiss={() => setRotatedSecret(null)}
                              />
                            )}
                          </div>

                          <div>
                            <label className="settings-label">{t("hub.admin.owh.subs.title")}</label>
                            <p className="muted">{t("hub.admin.owh.subs.hint")}</p>
                            {!panel.subscriptionsLoaded ? (
                              <p className="muted">{t("hub.admin.owh.subs.loading")}</p>
                            ) : (
                              <>
                                <EventSubscriptionEditor
                                  channels={textChannels}
                                  value={panel.subscriptions}
                                  onChange={(subs) => updatePanel(wh.id, { subscriptions: subs })}
                                />
                                <div style={{ marginTop: "var(--space-2)" }}>
                                  <button onClick={() => saveSubscriptions(wh.id)} disabled={panel.savingSubscriptions}>
                                    {panel.savingSubscriptions ? t("hub.admin.owh.subs.saving") : t("hub.admin.owh.subs.save")}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <div>
                            <label className="settings-label">{t("hub.admin.owh.log.title")}</label>
                            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                              <select
                                value={panel.deliveryEventFilter}
                                onChange={(e) =>
                                  loadDeliveries(wh.id, {
                                    eventType: e.target.value,
                                    success: panel.deliverySuccessFilter,
                                    offset: 0,
                                    append: false,
                                  })
                                }
                              >
                                <option value="">{t("hub.admin.owh.log.all_events")}</option>
                                {Array.from(new Set(panel.deliveries.map((d) => d.event_type))).map((ev) => (
                                  <option key={ev} value={ev}>{ev}</option>
                                ))}
                              </select>
                              <select
                                value={panel.deliverySuccessFilter}
                                onChange={(e) =>
                                  loadDeliveries(wh.id, {
                                    eventType: panel.deliveryEventFilter,
                                    success: e.target.value,
                                    offset: 0,
                                    append: false,
                                  })
                                }
                              >
                                <option value="">{t("hub.admin.owh.log.all_statuses")}</option>
                                <option value="true">{t("hub.admin.owh.log.success")}</option>
                                <option value="false">{t("hub.admin.owh.log.failure")}</option>
                              </select>
                            </div>
                            {panel.deliveries.length === 0 ? (
                              <p className="muted">{t("hub.admin.owh.log.empty")}</p>
                            ) : (
                              <table className="members-table">
                                <thead>
                                  <tr>
                                    <th>{t("hub.admin.owh.log.col.time")}</th>
                                    <th>{t("hub.admin.owh.log.col.event")}</th>
                                    <th>{t("hub.admin.owh.log.col.attempt")}</th>
                                    <th>{t("hub.admin.owh.col.status")}</th>
                                    <th>{t("hub.admin.owh.log.col.result")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {panel.deliveries.map((d) => (
                                    <tr key={d.id}>
                                      <td>{formatRelative(d.attempted_at)}</td>
                                      <td><code>{d.event_type}</code></td>
                                      <td>{d.attempt_number}</td>
                                      <td>{d.status_code ?? <span className="muted">—</span>}</td>
                                      <td>
                                        {d.success ? (
                                          <span className="status-badge status-badge-success">OK</span>
                                        ) : (
                                          <span className="status-badge status-badge-danger" title={d.error_msg ?? undefined}>
                                            {t("hub.admin.owh.log.failed")}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div style={{ marginTop: "var(--space-2)" }}>
                              <button
                                className="btn-small btn-secondary"
                                disabled={panel.loadingDeliveries}
                                onClick={() =>
                                  loadDeliveries(wh.id, {
                                    eventType: panel.deliveryEventFilter,
                                    success: panel.deliverySuccessFilter,
                                    offset: panel.deliveryOffset + 50,
                                    append: true,
                                  })
                                }
                              >
                                {panel.loadingDeliveries ? t("hub.admin.owh.log.loading") : t("hub.admin.owh.log.load_more")}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
