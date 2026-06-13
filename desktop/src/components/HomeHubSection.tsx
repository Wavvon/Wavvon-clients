import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Hub } from "../types";

interface HomeHubList {
  master_pubkey: string;
  hubs: string[];
  issued_at: number;
  sequence: number;
  signature: string;
}

interface SetHomeHubListResult {
  designation: HomeHubList;
  posted_count: number;
  failures: { url: string; error: string }[];
}

type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "ok"; postedCount: number; failures: { url: string; error: string }[] }
  | { state: "error"; message: string };

export function HomeHubSection({ hubs }: { hubs: Hub[] }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });

  useEffect(() => {
    invoke<HomeHubList | null>("get_home_hub_list")
      .then((result) => {
        setOrder(result ? result.hubs : []);
      })
      .catch(() => setOrder([]))
      .finally(() => setLoading(false));
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setSaveStatus({ state: "idle" });
  }

  function moveDown(index: number) {
    setOrder((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setSaveStatus({ state: "idle" });
  }

  function remove(url: string) {
    setOrder((prev) => prev.filter((u) => u !== url));
    setSaveStatus({ state: "idle" });
  }

  function addHub(url: string) {
    if (!url) return;
    setOrder((prev) => [...prev, url]);
    setSaveStatus({ state: "idle" });
  }

  async function handleSave() {
    setSaveStatus({ state: "saving" });
    try {
      const result = await invoke<SetHomeHubListResult>("set_home_hub_list", {
        urls: order,
      });
      setSaveStatus({
        state: "ok",
        postedCount: result.posted_count,
        failures: result.failures,
      });
    } catch (e) {
      setSaveStatus({ state: "error", message: String(e) });
    }
  }

  const availableToAdd = hubs.filter((h) => !order.includes(h.hub_url));

  if (loading) {
    return (
      <div className="settings-section">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      {order.length === 0 ? (
        <p className="muted">No home hubs configured yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px 0" }}>
          {order.map((url, i) => (
            <li key={url} className="settings-row" style={{ marginBottom: "6px", alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                {url}
                {i === 0 && (
                  <span className="muted" style={{ marginLeft: "8px", fontSize: "0.85em" }}>
                    (preferred)
                  </span>
                )}
              </span>
              <button
                className="btn-secondary"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                className="btn-secondary"
                onClick={() => moveDown(i)}
                disabled={i === order.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                className="btn-secondary"
                onClick={() => remove(url)}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableToAdd.length > 0 && (
        <div className="settings-row" style={{ marginBottom: "12px" }}>
          <select
            defaultValue=""
            onChange={(e) => {
              addHub(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Add hub…
            </option>
            {availableToAdd.map((h) => (
              <option key={h.hub_id} value={h.hub_url}>
                {h.hub_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="settings-row">
        <button
          onClick={handleSave}
          disabled={saveStatus.state === "saving" || order.length === 0}
        >
          {saveStatus.state === "saving" ? "Saving…" : "Save"}
        </button>
        {saveStatus.state === "ok" && (
          <span className="muted">
            Saved to {saveStatus.postedCount} hub{saveStatus.postedCount !== 1 ? "s" : ""}
          </span>
        )}
        {saveStatus.state === "error" && (
          <span style={{ color: "var(--danger)" }}>{saveStatus.message}</span>
        )}
      </div>

      {saveStatus.state === "ok" && saveStatus.failures.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <p className="muted" style={{ marginBottom: "4px" }}>
            Failed to reach:
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {saveStatus.failures.map((f) => (
              <li key={f.url} style={{ color: "var(--danger)", fontSize: "0.85em" }}>
                {f.url} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
