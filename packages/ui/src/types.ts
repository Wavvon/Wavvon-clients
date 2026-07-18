export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  edited_at: number | null;
  attachments?: Attachment[];
  reactions?: Reaction[];
}

export interface AllianceSharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
  // Optional: desktop's own AllianceSharedChannel (apps/desktop/src/types.ts)
  // hasn't picked up the v2 alliance-sharing fields yet. Keep these optional
  // here so AllianceView stays a valid sink for both the old and new shape.
  channel_type?: "text" | "forum" | "banner" | "spawner";
  parent_id?: string | null;
  is_category?: boolean;
}

export interface BlockEntry {
  pubkey: string;
  since: number;
}

export interface IgnoreEntry {
  pubkey: string;
  since: number;
}

export interface BotAppLaunchEvent {
  type: "bot_app_launch";
  bot_id: string;
  title: string;
  description: string;
  channel_id: string;
}

export interface BotCommandDef {
  name: string;
  description: string;
}

export interface BotProfile {
  pubkey: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  commands: BotCommandDef[];
}

export interface HubEmoji {
  id: string;
  name: string;
  url: string;
}

/** A claimant's current voice standing relative to an event (events.md §7.5).
 *  Computed by the caller — this component never inspects voice/assignment
 *  state itself, only renders what it's told. */
export type ClaimantVoiceStatus =
  | { kind: "in_voice"; channelName: string }
  | { kind: "assigned"; channelName: string }
  | { kind: "none" };

/** One staging-panel bucket: an event slot's claimants, or the synthesized
 *  "Unassigned" bucket (`id: null`) for plain "going" RSVPs with no slot. */
export interface StagingGroup {
  id: string | null;
  name: string;
  capacity: number | null;
  claimed: number | null;
  claimants: string[];
}
