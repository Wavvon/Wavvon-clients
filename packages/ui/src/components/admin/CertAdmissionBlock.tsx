import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { CertAdmissionSettings, CertType } from "../../types";
import { IssuerHubPicker, type IssuerHub } from "../settings/IssuerHubPicker";

/**
 * Admission from other hubs as a fast lane (certified-admission.md): whole
 * trusted hubs, specific certificate types of a hub, what happens to everyone
 * else, and whether a certificate stands in for an invite. Edits `settings`
 * in place; the section saves it.
 */
export function CertAdmissionBlock({ settings, onChange, knownHubs, lookupHub, listCertTypes }: {
  settings: CertAdmissionSettings;
  onChange: (next: CertAdmissionSettings) => void;
  knownHubs: IssuerHub[];
  lookupHub: (url: string) => Promise<IssuerHub>;
  /** A hub's published catalogue, by its base URL. */
  listCertTypes: (hubUrl: string) => Promise<CertType[]>;
}) {
  const { t } = useTranslation();
  const trustedTypes = settings.cert_trusted_types ?? [];
  const urls = settings.cert_issuer_urls ?? {};
  const [typesByIssuer, setTypesByIssuer] = useState<Record<string, CertType[]>>({});
  const [pickHub, setPickHub] = useState("");
  const [pickType, setPickType] = useState("");
  const [addingHub, setAddingHub] = useState(false);

  const hubs: IssuerHub[] = [
    ...knownHubs,
    ...[...settings.cert_trusted_issuers, ...trustedTypes.map((tt) => tt.issuer)]
      .filter((pk, i, all) => all.indexOf(pk) === i && !knownHubs.some((h) => h.pubkey === pk))
      .map((pk) => ({ pubkey: pk, name: formatPubkey(pk), url: urls[pk] ?? "" })),
  ];
  const hubName = (pk: string) => hubs.find((h) => h.pubkey === pk)?.name ?? formatPubkey(pk);

  async function loadTypes(pk: string) {
    const url = hubs.find((h) => h.pubkey === pk)?.url || urls[pk];
    if (!url || typesByIssuer[pk]) return;
    try {
      const types = await listCertTypes(url);
      setTypesByIssuer((m) => ({ ...m, [pk]: types }));
    } catch {
      setTypesByIssuer((m) => ({ ...m, [pk]: [] }));
    }
  }

  // Names for the rows already trusted.
  useEffect(() => {
    for (const tt of trustedTypes) void loadTypes(tt.issuer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustedTypes.length, knownHubs.length]);

  const typeName = (issuer: string, id: string) =>
    typesByIssuer[issuer]?.find((x) => x.id === id)?.name ?? formatPubkey(id);

  function addType() {
    const hub = hubs.find((h) => h.pubkey === pickHub);
    if (!hub || !pickType) return;
    if (trustedTypes.some((tt) => tt.issuer === hub.pubkey && tt.cert_type === pickType)) return;
    onChange({
      ...settings,
      cert_trusted_types: [...trustedTypes, { issuer: hub.pubkey, cert_type: pickType }],
      // An address makes the issuer pullable, which is how a real client is
      // admitted: no client presents certificates itself.
      cert_issuer_urls: hub.url ? { ...urls, [hub.pubkey]: hub.url } : urls,
    });
    setPickType("");
  }

  const initials = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const trustedHubs = settings.cert_trusted_issuers;
  const setTrusted = (hub: IssuerHub, on: boolean) => {
    const nextUrls = { ...urls };
    if (on && hub.url) nextUrls[hub.pubkey] = hub.url;
    const issuers = trustedHubs.filter((x) => x !== hub.pubkey);
    onChange({ ...settings, cert_trusted_issuers: on ? [...issuers, hub.pubkey] : issuers, cert_issuer_urls: nextUrls });
  };

  return (
    <div className="cert-admission">
      <p className="cert-admission-intro">{t("hub.admin.certs.admission.intro")}</p>

      <div className="cert-admission-lists">
        <div className="cert-admission-box">
          <h2>{t("hub.admin.certs.admission.whole")}</h2>
          <p className="muted">{t("hub.admin.certs.admission.whole_hint")}</p>
          {trustedHubs.length > 0 && (
            <ul className="cert-admission-rows">
              {trustedHubs.map((pk) => (
                <li key={pk}>
                  <span className="cert-admission-av" aria-hidden="true">{initials(hubName(pk))}</span>
                  <span className="cert-admission-what">{hubName(pk)} <span className="member-pk">{formatPubkey(pk)}</span></span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    aria-label={t("hub.admin.certs.admission.remove_named", { name: hubName(pk) })}
                    onClick={() => setTrusted(hubs.find((h) => h.pubkey === pk) ?? { pubkey: pk, name: hubName(pk), url: urls[pk] ?? "" }, false)}
                  >
                    {t("hub.admin.certs.admission.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addingHub ? (
            <div className="cert-admission-add">
              <IssuerHubPicker
                hubs={hubs.filter((h) => !trustedHubs.includes(h.pubkey))}
                trusted={new Set()}
                onToggle={(hub, on) => { if (on) { setTrusted(hub, true); setAddingHub(false); } }}
                lookupHub={lookupHub}
              />
            </div>
          ) : (
            <button type="button" className="cert-admission-add-btn" onClick={() => setAddingHub(true)}>
              {t("hub.admin.certs.admission.add_hub")}
            </button>
          )}
        </div>

        <div className="cert-admission-box">
          <h2>{t("hub.admin.certs.admission.specific")}</h2>
          <p className="muted">{t("hub.admin.certs.admission.specific_hint")}</p>
          {trustedTypes.length > 0 && (
            <ul className="cert-admission-rows">
              {trustedTypes.map((tt) => (
                <li key={`${tt.issuer}:${tt.cert_type}`}>
                  <span className="cert-admission-av" aria-hidden="true">{initials(hubName(tt.issuer))}</span>
                  <span className="cert-admission-what">{hubName(tt.issuer)} <span className="muted">›</span> <strong>{typeName(tt.issuer, tt.cert_type)}</strong></span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    aria-label={t("hub.admin.certs.admission.remove_named", { name: typeName(tt.issuer, tt.cert_type) })}
                    onClick={() => onChange({ ...settings, cert_trusted_types: trustedTypes.filter((x) => x !== tt) })}
                  >
                    {t("hub.admin.certs.admission.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="cert-admission-pick">
            <select
              aria-label={t("hub.admin.certs.admission.pick_hub")}
              value={pickHub}
              onChange={(e) => { setPickHub(e.target.value); setPickType(""); void loadTypes(e.target.value); }}
            >
              <option value="">{t("hub.admin.certs.admission.pick_hub")}</option>
              {hubs.filter((h) => h.url).map((h) => <option key={h.pubkey} value={h.pubkey}>{h.name}</option>)}
            </select>
            <select
              aria-label={t("hub.admin.certs.admission.pick_type")}
              value={pickType}
              disabled={!pickHub || !(typesByIssuer[pickHub]?.length)}
              onChange={(e) => setPickType(e.target.value)}
            >
              <option value="">
                {pickHub && typesByIssuer[pickHub]?.length === 0
                  ? t("hub.admin.certs.admission.no_types")
                  : t("hub.admin.certs.admission.pick_type")}
              </option>
              {(typesByIssuer[pickHub] ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button type="button" className="btn-secondary btn-small" onClick={addType} disabled={!pickHub || !pickType}>
              {t("hub.admin.certs.admission.add")}
            </button>
          </div>
        </div>
      </div>

      <fieldset className="cert-admission-others">
        <legend>{t("hub.admin.certs.admission.others")}</legend>
        <label className={settings.cert_others !== "refuse" ? "selected" : undefined}>
          <input
            type="radio"
            name="cert-others"
            checked={settings.cert_others !== "refuse"}
            onChange={() => onChange({ ...settings, cert_others: "lobby" })}
          />
          <span>
            <strong>{t("hub.admin.certs.admission.others_lobby_title")}</strong>
            <span className="muted">{t("hub.admin.certs.admission.others_lobby_desc")}</span>
          </span>
        </label>
        <label className={settings.cert_others === "refuse" ? "selected" : undefined}>
          <input
            type="radio"
            name="cert-others"
            checked={settings.cert_others === "refuse"}
            onChange={() => onChange({ ...settings, cert_others: "refuse" })}
          />
          <span>
            <strong>{t("hub.admin.certs.admission.others_refuse_title")}</strong>
            <span className="muted">{t("hub.admin.certs.admission.others_refuse_desc")}</span>
          </span>
        </label>
      </fieldset>

      <label className="roles-perm-row cert-admission-invite">
        <span className="roles-perm-text">
          <span>{t("hub.admin.certs.admission.invite_title")}</span>
          <span className="muted roles-perm-desc">{t("hub.admin.certs.admission.invite_desc")}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="roles-switch"
          checked={!!settings.cert_replaces_invite}
          onChange={(e) => onChange({ ...settings, cert_replaces_invite: e.target.checked })}
        />
      </label>
    </div>
  );
}
