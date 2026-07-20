import { useEffect, useState } from "react";
import { formatPubkey } from "@wavvon/core";

const PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

export interface ChannelBanRow {
  pubkey: string;
  reason?: string | null;
}

export interface ChannelBansTabActions {
  listChannelBans: (channelId: string) => Promise<ChannelBanRow[]>;
  banFromChannel: (channelId: string, pubkey: string, reason?: string) => Promise<void>;
  unbanFromChannel: (channelId: string, pubkey: string) => Promise<void>;
}

export interface ChannelBansTabUser {
  public_key: string;
  display_name: string | null;
}

interface Props {
  channelId: string;
  actions: ChannelBansTabActions;
  /** When provided, bans are picked from this list instead of a raw pubkey
   * field. Optional — desktop passes its already-loaded member list; web
   * can too, but neither is required for the tab to work. */
  users?: ChannelBansTabUser[];
  /** True only where the ban action persists a reason (the hub's v1
   * moderation route does; the newer per-channel v2 route currently
   * discards it — see client-parity notes). Hides the field otherwise so
   * it never looks like it saved when it silently didn't. */
  supportsReason?: boolean;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ChannelBansTab({ channelId, actions, users, supportsReason }: Props) {
  const [bans, setBans] = useState<ChannelBanRow[] | null>(null);
  const [pubkey, setPubkey] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setBans(await actions.listChannelBans(channelId)); }
    catch (e) { setError(errorMessage(e)); }
  }

  useEffect(() => { void load(); }, [channelId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function handleBan() {
    const key = pubkey.trim().toLowerCase();
    if (!PUBKEY_RE.test(key)) { setError("Enter a 64-character public key."); return; }
    void run(async () => {
      await actions.banFromChannel(channelId, key, supportsReason ? reason.trim() || undefined : undefined);
      setPubkey("");
      setReason("");
    });
  }

  const bannedSet = new Set((bans ?? []).map((b) => b.pubkey));
  const candidates = (users ?? []).filter((u) => !bannedSet.has(u.public_key));

  return (
    <div>
      <p className="muted">Banned users can't read or post in this channel, even if their role otherwise allows it.</p>
      {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}

      <div className="settings-row" style={{ gap: "var(--space-2)", alignItems: "stretch" }}>
        {users ? (
          <select
            value={pubkey}
            onChange={(e) => setPubkey(e.target.value)}
            aria-label="User to ban"
            style={{ flex: 1 }}
          >
            <option value="">— pick a user —</option>
            {candidates.map((u) => (
              <option key={u.public_key} value={u.public_key}>
                {u.display_name || formatPubkey(u.public_key)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={pubkey}
            onChange={(e) => setPubkey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBan(); }}
            placeholder="Public key to ban"
            aria-label="Public key to ban"
            style={{ flex: 1 }}
          />
        )}
        {supportsReason && (
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBan(); }}
            placeholder="Reason (optional)"
            aria-label="Ban reason"
            style={{ flex: 1 }}
          />
        )}
        <button onClick={handleBan} disabled={busy || !pubkey.trim()}>Ban</button>
      </div>

      {bans === null ? (
        <p className="muted">Loading…</p>
      ) : bans.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>No one is banned from this channel.</p>
      ) : (
        bans.map((b) => {
          const u = users?.find((x) => x.public_key === b.pubkey);
          return (
            <div key={b.pubkey} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span className="member-pk">
                {u?.display_name || formatPubkey(b.pubkey)}
                {b.reason && <span className="muted"> — {b.reason}</span>}
              </span>
              <button className="btn-small btn-secondary" disabled={busy} onClick={() => run(() => actions.unbanFromChannel(channelId, b.pubkey))}>
                Unban
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
