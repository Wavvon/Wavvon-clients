import { allianceForumWriteErrorCode } from "../../platform/commands/forum";

// Alliance forum writes (forum federation phase 2) reject with one of three
// codes -- see platform/commands/forum.ts's allianceForumWriteErrorCode for
// why this matches on substring rather than an exact HubApiError body.
export function describeForumWriteError(e: unknown, t: (key: string) => string): string {
  const message = String(e);
  const code = allianceForumWriteErrorCode(message);
  return code ? t(`forum.errors.${code}`) : message;
}
