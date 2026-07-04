/** Joining a spawner channel's voice creates a sibling temp room and moves
 *  the joiner into it (temp-voice-channels.md §2) — the ready reply, not the
 *  channel id the client asked to join, is the source of truth for where the
 *  joiner actually landed. `channel_id` is optional here because today's hub
 *  `/voice/ws` ready frame doesn't echo it back (only the main hub WS's
 *  `voice_joined` message does); falling back to the requested id keeps
 *  ordinary (non-spawner) joins unaffected either way. */
export function resolveVoiceChannelId(
  requestedChannelId: string,
  ready: { channel_id?: string },
): string {
  return ready.channel_id || requestedChannelId;
}
