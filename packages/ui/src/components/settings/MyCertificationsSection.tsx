import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MyCertification } from "../../types";
import { loadHiddenBadgeSet, saveHiddenBadgeSet } from "../../utils/hiddenBadges";

export type { MyCertification } from "../../types";

// A member's own earned hub certifications + achievement badges (read-only,
// aggregated from every hub they're on). Badges (certs with a `label`) render
// distinctly, link back to the granting community, and can be hidden/shown by
// the user (client-side curation — see utils/hiddenBadges.ts).

function issuerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface Props {
  publicKey: string | null;
  listMyCertifications: (pubkey: string) => Promise<MyCertification[]>;
  /** Defaults to utils/hiddenBadges.ts's flat localStorage key — override
   *  only if a platform wants account-scoped storage instead. */
  loadHiddenBadges?: () => Set<string>;
  saveHiddenBadges?: (hidden: Set<string>) => void;
}

export function MyCertificationsSection({
  publicKey,
  listMyCertifications,
  loadHiddenBadges = loadHiddenBadgeSet,
  saveHiddenBadges = saveHiddenBadgeSet,
}: Props) {
  const { t } = useTranslation();
  const [certs, setCerts] = useState<MyCertification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenBadges());

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    listMyCertifications(publicKey)
      .then((c) => { if (!cancelled) setCerts(c); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  function toggleHidden(sig: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(sig)) next.delete(sig); else next.add(sig);
      saveHiddenBadges(next);
      return next;
    });
  }

  const badges = (certs ?? []).filter((c) => c.payload.label && c.payload.standing !== "revoked");
  const plainCerts = (certs ?? []).filter((c) => !c.payload.label);

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.certifications.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        {t("settings.account.certifications.hint")}
      </p>
      {error && <p className="error-text">{error}</p>}

      {certs === null ? (
        <p className="muted">{t("modal.loading")}</p>
      ) : (
        <>
          {badges.length > 0 && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              {badges.map((c) => {
                const isHidden = hidden.has(c.signature);
                return (
                  <div
                    key={c.signature}
                    className="settings-row"
                    style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, opacity: isHidden ? 0.5 : 1 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span aria-hidden="true">{c.payload.icon || "🏆"}</span>
                      <strong>{c.payload.label}</strong>
                      {(() => {
                        // Prefer the payload's issuer_url; fall back to the hub we
                        // fetched it from (the client always knows that), so the
                        // "learn more" link works even if the issuer hasn't set
                        // its hub_url.
                        const link = c.payload.issuer_url || c.hub_url || "";
                        return link ? (
                          <a className="muted" href={link} target="_blank" rel="noreferrer" style={{ fontSize: "var(--text-xs)" }} title={link}>
                            {t("settings.account.certifications.from_issuer", { host: issuerHost(link) })}
                          </a>
                        ) : null;
                      })()}
                      {c.payload.description && (
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>— {c.payload.description}</span>
                      )}
                    </span>
                    <button className="btn-small btn-secondary" onClick={() => toggleHidden(c.signature)}>
                      {isHidden ? t("settings.account.certifications.show") : t("settings.account.certifications.hide")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {plainCerts.length === 0 && badges.length === 0 ? (
            <p className="muted">{t("settings.account.certifications.empty")}</p>
          ) : (
            plainCerts.map((c) => (
              <div key={c.signature} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>
                  🏅 {issuerHost(c.payload.issuer_url)}
                  {c.payload.standing === "revoked" && <span className="muted"> · {t("settings.account.certifications.revoked_suffix")}</span>}
                </span>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {t("settings.account.certifications.member_since", { date: new Date(c.payload.member_since * 1000).toLocaleDateString() })}
                </span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
