import { useState } from "react";
import { useTranslation } from "react-i18next";

/** A hub that can be trusted as a certification issuer, named the way a
 *  person knows it. The key travels with it but is never what anyone types. */
export interface IssuerHub {
  pubkey: string;
  name: string;
  url: string;
  icon?: string | null;
}

interface Props {
  /** Hubs the client already knows: joined ones, and on the admin side the
   *  hub's alliance partners. */
  hubs: IssuerHub[];
  trusted: Set<string>;
  /** Trusted without a choice to make (a hub you are a member of): shown
   *  ticked and locked. */
  implicit?: Set<string>;
  onToggle: (hub: IssuerHub, trusted: boolean) => void;
  /** Reads a hub's `/info` so one the client is not in can be added by
   *  address. Omit to offer the known hubs only. */
  lookupHub?: (url: string) => Promise<IssuerHub>;
}

// Picking an issuer used to mean pasting its 64-character key. The client
// knows every hub it joined, so the common case is a tick; "add by address"
// covers a hub it does not know, and still never shows the key.
export function IssuerHubPicker({ hubs, trusted, implicit, onToggle, lookupHub }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [found, setFound] = useState<IssuerHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  async function lookUp() {
    if (!lookupHub) return;
    setLooking(true);
    setError(null);
    setFound(null);
    try {
      setFound(await lookupHub(address.trim()));
    } catch (e) {
      setError(t("issuer_picker.lookup_failed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLooking(false);
    }
  }

  return (
    <div>
      {hubs.length === 0 && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("issuer_picker.no_hubs")}</p>}
      {hubs.map((hub) => (
        <label key={hub.pubkey} className="settings-row" style={{ gap: "var(--space-2)" }} title={hub.pubkey}>
          <input
            type="checkbox"
            checked={trusted.has(hub.pubkey) || !!implicit?.has(hub.pubkey)}
            disabled={implicit?.has(hub.pubkey)}
            onChange={(e) => onToggle(hub, e.target.checked)}
          />
          {hub.icon && <img src={hub.icon} alt="" width={20} height={20} style={{ borderRadius: "var(--r-sm)" }} />}
          <strong>{hub.name}</strong>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {implicit?.has(hub.pubkey) ? t("issuer_picker.member") : hub.url}
          </span>
        </label>
      ))}
      {lookupHub && (
        <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
          <input
            type="url"
            value={address}
            onChange={(e) => { setAddress(e.target.value); setFound(null); }}
            placeholder={t("issuer_picker.address_placeholder")}
            aria-label={t("issuer_picker.address_label")}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn-small btn-secondary" disabled={!address.trim() || looking} onClick={() => void lookUp()}>
            {t("issuer_picker.look_up")}
          </button>
        </div>
      )}
      {found && (
        <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }} title={found.pubkey}>
          {found.icon && <img src={found.icon} alt="" width={20} height={20} style={{ borderRadius: "var(--r-sm)" }} />}
          <strong>{found.name}</strong>
          <button
            className="btn-small"
            disabled={trusted.has(found.pubkey)}
            onClick={() => {
              onToggle(found, true);
              setFound(null);
              setAddress("");
            }}
          >
            {t(trusted.has(found.pubkey) ? "issuer_picker.already" : "issuer_picker.trust")}
          </button>
        </div>
      )}
      {error && <p className="error-text" style={{ fontSize: "var(--text-xs)" }}>{error}</p>}
    </div>
  );
}

/** Joined hubs plus alliance partners as issuer candidates: one entry per key,
 *  and never the hub being administered, which needs no one to vouch for it. */
export function knownIssuerHubs(
  hubs: { hub_id: string; hub_name: string; hub_url: string; hub_icon: string | null }[],
  partners: { hub_public_key: string; hub_name: string; hub_url: string }[],
  ownHubUrl?: string,
): IssuerHub[] {
  const own = ownHubUrl?.replace(/\/$/, "");
  const byKey = new Map<string, IssuerHub>();
  for (const h of hubs) byKey.set(h.hub_id, { pubkey: h.hub_id, name: h.hub_name, url: h.hub_url, icon: h.hub_icon });
  for (const p of partners) {
    if (!byKey.has(p.hub_public_key)) byKey.set(p.hub_public_key, { pubkey: p.hub_public_key, name: p.hub_name, url: p.hub_url });
  }
  return [...byKey.values()].filter((h) => h.url.replace(/\/$/, "") !== own);
}
