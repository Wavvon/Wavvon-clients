// Alliance forum writes (forum federation phase 2) reject with one of three
// codes. Matches on substring rather than an exact error body because a
// post/reply proxy failure gets wrapped by the owning-side federation client
// ("Failed to create forum post on peer: Peer returned HTTP 403 Forbidden:
// forum_remote_write_disabled").
const FORUM_WRITE_ERROR_CODES = [
  "channel_not_shared_with_caller",
  "forum_remote_write_disabled",
  "forum_remote_write_posts_disabled",
] as const;

export function describeForumWriteError(e: unknown, t: (key: string) => string): string {
  const message = String(e);
  const code = FORUM_WRITE_ERROR_CODES.find((c) => message.includes(c));
  return code ? t(`forum.errors.${code}`) : message;
}
