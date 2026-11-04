/** What a member is doing right now, for the member list's status line. */
export interface MemberActivity {
  kind: "voice" | "live";
  channel: string;
}

/** Live wins over plain voice: it is the more specific thing to say. */
export function memberActivity(
  voiceByChannel: Record<string, { public_key: string }[]>,
  lives: { channel_id: string; sharer_pubkey: string; kind?: string }[],
  channelName: (id: string) => string | undefined,
): Map<string, MemberActivity> {
  const out = new Map<string, MemberActivity>();
  for (const [id, people] of Object.entries(voiceByChannel)) {
    const channel = channelName(id);
    if (!channel) continue;
    for (const p of people) out.set(p.public_key, { kind: "voice", channel });
  }
  for (const l of lives) {
    const channel = channelName(l.channel_id);
    if (channel && l.kind !== "webcam") out.set(l.sharer_pubkey, { kind: "live", channel });
  }
  return out;
}
