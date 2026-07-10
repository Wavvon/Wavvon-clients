import { useEffect, useState } from "react";
import { listChannelBans, banFromChannel, unbanFromChannel } from "@platform";
import type { ChannelBan } from "@platform";
import { HubApiError } from "../../platform/http";
import { formatPubkey } from "@wavvon/core";

const PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

export function ChannelBansTab({ channelId }: { channelId: string }) {
  const [bans, setBans] = useState<ChannelBan[] | null>(null);
  const [pubkey, setPubkey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setBans(await listChannelBans(channelId)); }
    catch (e) { setError(e instanceof HubApiError ? e.message : String(e)); }
  }

  useEffect(() => { void load(); }, [channelId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof HubApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function handleBan() {
    const key = pubkey.trim().toLowerCase();
    if (!PUBKEY_RE.test(key)) { setError("Enter a 64-character public key."); return; }
    void run(async () => { await banFromChannel(channelId, key); setPubkey(""); });
  }

  return (
    <div>
      <p className="muted">Banned users can't read or post in this channel, even if their role otherwise allows it.</p>
      {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}

      <div className="settings-row" style={{ gap: "var(--space-2)" }}>
        <input
          type="text"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleBan(); }}
          placeholder="Public key to ban"
          aria-label="Public key to ban"
          style={{ flex: 1 }}
        />
        <button onClick={handleBan} disabled={busy || !pubkey.trim()}>Ban</button>
      </div>

      {bans === null ? (
        <p className="muted">Loading…</p>
      ) : bans.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>No one is banned from this channel.</p>
      ) : (
        bans.map((b) => (
          <div key={b.pubkey} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span className="member-pk">{formatPubkey(b.pubkey)}</span>
            <button className="btn-small btn-secondary" disabled={busy} onClick={() => run(() => unbanFromChannel(channelId, b.pubkey))}>
              Unban
            </button>
          </div>
        ))
      )}
    </div>
  );
}
