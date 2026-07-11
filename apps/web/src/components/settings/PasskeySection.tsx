import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  isPasskeySupported,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
} from "@platform";
import type { CredentialInfo } from "@platform";

// Passkey management (Settings → Account): list, register, rename, remove.
// Passkeys are tied to a specific hub — registration targets the active one.
export function PasskeySection({ publicKey }: { publicKey: string | null }) {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<CredentialInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveHub, setNoActiveHub] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const supported = isPasskeySupported();

  useEffect(() => {
    if (!publicKey) return;
    listPasskeys()
      .then(setPasskeys)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "No active hub") {
          setNoActiveHub(true);
        } else {
          setError(String(e));
        }
      });
  }, [publicKey]);

  async function handleAdd() {
    if (!publicKey) return;
    setRegistering(true);
    setError(null);
    try {
      await registerPasskey(publicKey, undefined, newKeyName.trim() || undefined);
      setNewKeyName("");
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePasskey(id);
      setPasskeys((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await renamePasskey(id, renameValue.trim());
      setRenamingId(null);
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  if (!supported) {
    return (
      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label">{t("settings.account.passkeys.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.passkeys.unsupported")}
        </p>
      </div>
    );
  }

  if (noActiveHub) {
    return (
      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label">{t("settings.account.passkeys.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.passkeys.no_active_hub")}
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">{t("settings.account.passkeys.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        {t("settings.account.passkeys.hint")}
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {passkeys === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("modal.loading")}</p>
      ) : (
        <>
          {passkeys.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
              {t("settings.account.passkeys.empty")}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    padding: "8px 10px",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  {renamingId === pk.id ? (
                    <>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={{ flex: 1, fontSize: "var(--text-sm)" }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(pk.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button className="btn-primary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => handleRename(pk.id)}>{t("modal.save")}</button>
                      <button className="btn-secondary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => setRenamingId(null)}>{t("modal.cancel")}</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                        {pk.friendly_name ?? t("settings.account.passkeys.unnamed")}
                      </span>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {pk.last_used_at
                          ? t("settings.account.passkeys.used_date", { date: new Date(pk.last_used_at * 1000).toLocaleDateString() })
                          : t("settings.account.passkeys.added_date", { date: new Date(pk.created_at * 1000).toLocaleDateString() })}
                      </span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => { setRenamingId(pk.id); setRenameValue(pk.friendly_name ?? ""); }}
                      >
                        {t("settings.account.passkeys.rename_button")}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => handleDelete(pk.id)}
                      >
                        {t("settings.account.passkeys.remove_button")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t("settings.account.passkeys.name_placeholder")}
              style={{ width: 200 }}
            />
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={registering || !publicKey}
            >
              {registering ? t("settings.account.passkeys.registering") : t("settings.account.passkeys.add_button")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
