import { useEffect, useRef, useState } from "react";
import {
  SKINNABLE_TOKENS,
  VoxplySkin,
  SkinBase,
  applySkinTokens,
  clearSkinTokens,
  downloadSkin,
  parseSkinFromRgba,
  splitRgba,
  validateSkin,
} from "../skinValidation";

const BASES: SkinBase[] = ["calm", "classic", "linear", "light"];
const BASE_LABELS: Record<SkinBase, string> = {
  calm: "Calm",
  classic: "Classic",
  linear: "Linear",
  light: "Light",
};

interface Props {
  skin: VoxplySkin;
  onChange: (skin: VoxplySkin) => void;
}

function makeSeed(base: SkinBase, name = "My Skin"): VoxplySkin {
  return { format: "voxply.skin", version: 1, name, base, tokens: {} };
}

function readBaseToken(token: string, base: SkinBase): string {
  // Temporarily set the base theme, read the token, then restore custom
  const prev = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = base;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (prev !== undefined) document.documentElement.dataset.theme = prev;
  return v;
}

function TokenRow({
  tokenName,
  tokenType,
  label,
  value,
  base,
  onChange,
  onReset,
}: {
  tokenName: string;
  tokenType: "color" | "color-alpha" | "shadow" | "radius";
  label: string;
  value: string | undefined;
  base: SkinBase;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const effective = value ?? readBaseToken(tokenName, base);
  const isOverridden = value !== undefined;

  if (tokenType === "radius") {
    const numVal = parseFloat(effective) || 1;
    return (
      <div className="settings-row" style={{ alignItems: "center" }}>
        <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={numVal}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 120 }}
          aria-label={label}
        />
        <span style={{ width: 36, textAlign: "right", fontSize: "var(--text-xs)" }}>{numVal.toFixed(2)}×</span>
        {isOverridden && (
          <button className="btn-icon" onClick={onReset} title="Reset to base" aria-label={`Reset ${label}`} style={{ marginLeft: 4 }}>
            ↺
          </button>
        )}
      </div>
    );
  }

  if (tokenType === "shadow") {
    return (
      <div className="settings-row" style={{ alignItems: "center" }}>
        <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
        <input
          type="text"
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 200, fontSize: "var(--text-xs)", fontFamily: "monospace" }}
          aria-label={label}
        />
        {isOverridden && (
          <button className="btn-icon" onClick={onReset} title="Reset to base" aria-label={`Reset ${label}`} style={{ marginLeft: 4 }}>
            ↺
          </button>
        )}
      </div>
    );
  }

  if (tokenType === "color-alpha") {
    const { hex, alpha } = splitRgba(effective);
    return (
      <div className="settings-row" style={{ alignItems: "center" }}>
        <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
        <input
          type="color"
          value={hex.slice(0, 7)}
          onChange={(e) => onChange(parseSkinFromRgba(e.target.value, alpha))}
          style={{ width: 36, height: 24, padding: 2, cursor: "pointer" }}
          aria-label={`${label} color`}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={alpha}
          onChange={(e) => onChange(parseSkinFromRgba(hex, parseFloat(e.target.value)))}
          style={{ width: 80, marginLeft: 4 }}
          aria-label={`${label} opacity`}
        />
        <span style={{ width: 32, fontSize: "var(--text-xs)", textAlign: "right" }}>{Math.round(alpha * 100)}%</span>
        {isOverridden && (
          <button className="btn-icon" onClick={onReset} title="Reset to base" aria-label={`Reset ${label}`} style={{ marginLeft: 4 }}>
            ↺
          </button>
        )}
      </div>
    );
  }

  // color
  const hex6 = effective.startsWith("#") ? effective.slice(0, 7) : "#000000";
  return (
    <div className="settings-row" style={{ alignItems: "center" }}>
      <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
      <input
        type="color"
        value={hex6}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 24, padding: 2, cursor: "pointer" }}
        aria-label={label}
      />
      <input
        type="text"
        value={effective}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 100, marginLeft: 6, fontSize: "var(--text-xs)", fontFamily: "monospace" }}
        aria-label={`${label} hex`}
      />
      {isOverridden && (
        <button className="btn-icon" onClick={onReset} title="Reset to base" aria-label={`Reset ${label}`} style={{ marginLeft: 4 }}>
          ↺
        </button>
      )}
    </div>
  );
}

export function SkinEditor({ skin, onChange }: Props) {
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = skin.base;
    applySkinTokens(skin);
    return () => {
      // cleanup handled by caller when switching away from custom
    };
  }, [skin]);

  function updateName(name: string) {
    onChange({ ...skin, name: name.slice(0, 48) });
  }

  function updateBase(base: SkinBase) {
    onChange({ ...skin, base, tokens: {} });
  }

  function updateToken(token: string, value: string) {
    const tokens = { ...skin.tokens, [token]: value };
    const next = { ...skin, tokens };
    document.documentElement.style.setProperty(token, value);
    onChange(next);
  }

  function resetToken(token: string) {
    const tokens = { ...skin.tokens };
    delete tokens[token];
    document.documentElement.style.removeProperty(token);
    onChange({ ...skin, tokens });
  }

  function resetAll() {
    clearSkinTokens();
    onChange({ ...skin, tokens: {} });
  }

  function handleExport() {
    downloadSkin(skin);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const validated = validateSkin(raw);
        setImportError(null);
        onChange(validated);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Invalid skin file");
      }
    };
    reader.readAsText(file);
  }

  const overrideCount = Object.keys(skin.tokens).length;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="settings-section">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label className="settings-label" style={{ marginBottom: 0 }}>Skin name</label>
          <input
            type="text"
            value={skin.name}
            onChange={(e) => updateName(e.target.value)}
            maxLength={48}
            style={{ flex: 1 }}
            aria-label="Skin name"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label className="settings-label" htmlFor="skin-base-select" style={{ marginBottom: 0 }}>Base theme</label>
          <select
            id="skin-base-select"
            value={skin.base}
            onChange={(e) => updateBase(e.target.value as SkinBase)}
          >
            {BASES.map((b) => <option key={b} value={b}>{BASE_LABELS[b]}</option>)}
          </select>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Unset tokens inherit from this theme.
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={handleExport}>Export .voxplyskin</button>
          <button className="btn-secondary" onClick={handleImportClick}>Import .voxplyskin</button>
          {overrideCount > 0 && (
            <button className="btn-secondary" onClick={resetAll}>Reset all ({overrideCount})</button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".voxplyskin,application/json"
          style={{ display: "none" }}
          onChange={handleFileChange}
          aria-label="Import skin file"
        />
        {importError && (
          <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 6 }}>{importError}</p>
        )}
      </div>

      {SKINNABLE_TOKENS.map((group) => (
        <div key={group.group} className="settings-section">
          <label className="settings-label">{group.group}</label>
          {group.tokens.map((tok) => (
            <TokenRow
              key={tok.name}
              tokenName={tok.name}
              tokenType={tok.type}
              label={tok.label}
              value={skin.tokens[tok.name]}
              base={skin.base}
              onChange={(v) => updateToken(tok.name, v)}
              onReset={() => resetToken(tok.name)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export { makeSeed };
