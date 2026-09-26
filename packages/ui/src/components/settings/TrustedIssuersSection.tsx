import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import { addTrustRoot, normalizePubkey, removeTrustRoot, type TrustRoot } from "../../utils/trustRoots";

// Whose signatures this viewer believes (server-tags.md Part 4).
//
// One fixed home for review and removal; adding one in practice happens where
// a badge is shown, next to the issuer it belongs to. This list is not where
// anyone discovers a pubkey — it is where they see what they have already
// accepted and take it back.
//
// The hint says what a trust root does *not* do on purpose: it changes what
// this viewer sees, never what any hub lets anyone in.

interface Props {
  roots: TrustRoot[];
  onChange: (roots: TrustRoot[]) => void;
}

export function TrustedIssuersSection({ roots, onChange }: Props) {
  const { t } = useTranslation();
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const pending = normalizePubkey(pubkeyInput);
  const alreadyTrusted = !!pending && roots.some((r) => r.pubkey === pending);
  const malformed = pubkeyInput.trim().length > 0 && !pending;

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.privacy.trusted_issuers.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        {t("settings.privacy.trusted_issuers.hint")}
      </p>

      {roots.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.privacy.trusted_issuers.empty")}
        </p>
      ) : (
        roots.map((root) => (
          <div
            key={root.pubkey}
            className="settings-row"
            style={{ alignItems: "center", justifyContent: "space-between", gap: 6 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {root.label && <strong>{root.label}</strong>}
              <code className="pubkey-display" title={root.pubkey}>{formatPubkey(root.pubkey)}</code>
            </span>
            <button
              className="btn-small btn-secondary"
              onClick={() => onChange(removeTrustRoot(roots, root.pubkey))}
            >
              {t("settings.privacy.trusted_issuers.remove")}
            </button>
          </div>
        ))
      )}

      <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={pubkeyInput}
          onChange={(e) => setPubkeyInput(e.target.value)}
          placeholder={t("settings.privacy.trusted_issuers.pubkey_placeholder")}
          style={{ flex: 2, minWidth: 220 }}
        />
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder={t("settings.privacy.trusted_issuers.label_placeholder")}
          style={{ flex: 1, minWidth: 120 }}
        />
        <button
          className="btn-secondary"
          disabled={!pending || alreadyTrusted}
          onClick={() => {
            onChange(addTrustRoot(roots, pubkeyInput, labelInput));
            setPubkeyInput("");
            setLabelInput("");
          }}
        >
          {t("settings.privacy.trusted_issuers.add")}
        </button>
      </div>
      {/* A pasted key with a stray character would otherwise be stored and
          silently match nothing, which reads as "trusting it did nothing". */}
      {malformed && (
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
          {t("settings.privacy.trusted_issuers.malformed")}
        </p>
      )}
      {alreadyTrusted && (
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
          {t("settings.privacy.trusted_issuers.already")}
        </p>
      )}
    </div>
  );
}
