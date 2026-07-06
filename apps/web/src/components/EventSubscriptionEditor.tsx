import type { Channel, EventSubscription } from "../types";

const EVENT_TYPES = [
  "member.joined",
  "member.left",
  "member.kicked",
  "member.banned",
  "member.unbanned",
  "member.role_changed",
  "member.invite_created",
  "member.invite_used",
  "voice.joined",
  "voice.left",
  "voice.moved",
  "voice.server_muted",
  "voice.server_deafened",
  "message.created",
  "message.edited",
  "message.deleted",
  "message.bulk_deleted",
  "message.reaction_added",
  "message.reaction_removed",
  "message.mention_bot",
  "message.pinned",
  "channel.created",
  "channel.deleted",
  "channel.updated",
  "hub.settings_changed",
  "hub.invite_created",
  "moderation.timeout",
  "bot.added",
  "bot.removed",
] as const;

// message.* events (except message.mention_bot, which is already targeted)
// require an explicit channel list — same privacy gate the hub enforces at
// subscription-save time (docs/docs/outgoing-webhooks.md §2, bots.md §8).
function requiresChannels(event: string): boolean {
  return event.startsWith("message.") && event !== "message.mention_bot";
}

export interface EventSubscriptionEditorProps {
  channels: Channel[];
  value: EventSubscription[];
  onChange: (subscriptions: EventSubscription[]) => void;
}

export function eventSubscriptionsAreValid(subscriptions: EventSubscription[]): boolean {
  return subscriptions.every((s) => !requiresChannels(s.event) || (s.channels && s.channels.length > 0));
}

export function EventSubscriptionEditor({ channels, value, onChange }: EventSubscriptionEditorProps) {
  const textChannels = channels.filter((c) => !c.is_category);
  const byEvent = new Map(value.map((s) => [s.event, s]));

  function toggleEvent(event: string, checked: boolean) {
    if (checked) {
      onChange([...value, { event, channels: requiresChannels(event) ? [] : undefined }]);
    } else {
      onChange(value.filter((s) => s.event !== event));
    }
  }

  function toggleChannel(event: string, channelId: string) {
    const current = byEvent.get(event);
    if (!current) return;
    const set = new Set(current.channels ?? []);
    if (set.has(channelId)) set.delete(channelId); else set.add(channelId);
    onChange(value.map((s) => (s.event === event ? { ...s, channels: Array.from(set) } : s)));
  }

  return (
    <div className="event-subscription-editor">
      {EVENT_TYPES.map((event) => {
        const sub = byEvent.get(event);
        const enabled = sub !== undefined;
        const needsChannels = requiresChannels(event);
        const invalid = enabled && needsChannels && (!sub.channels || sub.channels.length === 0);
        return (
          <div key={event} className="event-subscription-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => toggleEvent(event, e.target.checked)}
              />
              <code>{event}</code>
            </label>
            {enabled && needsChannels && (
              <div className="event-subscription-channels">
                {textChannels.length === 0 ? (
                  <span className="muted">No channels available.</span>
                ) : (
                  textChannels.map((ch) => (
                    <label key={ch.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(sub.channels ?? []).includes(ch.id)}
                        onChange={() => toggleChannel(event, ch.id)}
                      />
                      #{ch.name}
                    </label>
                  ))
                )}
                {invalid && (
                  <p className="muted" style={{ color: "var(--danger)" }}>
                    Select at least one channel for this event.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
