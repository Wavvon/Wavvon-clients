import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type {
  AllianceDetail,
  AllianceInfo,
  AllianceInvite,
  AllianceSharedChannel,
  Channel,
} from "../types";

type AllianceTab = "members" | "channels" | "invite";

export function AlliancesSection({
  channels,
  ownHubUrl,
}: {
  channels: Channel[];
  ownHubUrl: string;
}) {
  const { t } = useTranslation();
  const [alliances, setAlliances] = useState<AllianceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AllianceDetail | null>(null);
  const [shared, setShared] = useState<AllianceSharedChannel[]>([]);
  const [invite, setInvite] = useState<AllianceInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<AllianceTab>("members");

  const [pushTargetUrl, setPushTargetUrl] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushSending, setPushSending] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);

  async function refresh() {
    try {
      const list = await invoke<AllianceInfo[]>("list_alliances");
      setAlliances(list);
      if (selectedId && !list.find((a) => a.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setShared([]);
      }

    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshDetail(id: string) {
    try {
      const d = await invoke<AllianceDetail>("get_alliance", { allianceId: id });
      const sh = await invoke<AllianceSharedChannel[]>(
        "list_alliance_shared_channels",
        { allianceId: id },
      );
      setDetail(d);
      setShared(sh);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
  }, [selectedId]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await invoke<AllianceInfo>("create_alliance", { name });
      setNewName("");
      setIsCreating(false);
      await refresh();
      setSelectedId(created.id);
      setTab("invite");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerateInvite() {
    if (!selectedId) return;
    try {
      const inv = await invoke<AllianceInvite>("create_alliance_invite", {
        allianceId: selectedId,
      });
      setInvite(inv);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleJoin() {
    const code = joinCode.trim();
    if (!code) return;
    let u: string, a: string, tok: string;
    try {
      const parsed = JSON.parse(atob(code));
      u = parsed.u; a = parsed.a; tok = parsed.t;
      if (!u || !a || !tok) throw new Error("invalid");
    } catch {
      setError("Invalid share code — make sure you pasted it completely.");
      return;
    }
    try {
      await invoke("join_alliance", {
        inviterHubUrl: u,
        allianceId: a,
        inviteToken: tok,
        ownHubPublicUrl: ownHubUrl || u,
      });
      setJoinCode("");
      await refresh();
      setSelectedId(a);
      setTab("members");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLeave() {
    if (!selectedId) return;
    if (!confirm("Leave this alliance? Your hub stops sharing channels with it.")) return;
    try {
      await invoke("leave_alliance", { allianceId: selectedId });
      setSelectedId(null);
      setDetail(null);
      setShared([]);
      setInvite(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleToggleShare(channelId: string, currentlyShared: boolean) {
    if (!selectedId) return;
    try {
      if (currentlyShared) {
        await invoke("unshare_channel_from_alliance", { allianceId: selectedId, channelId });
      } else {
        await invoke("share_channel_with_alliance", { allianceId: selectedId, channelId });
      }
      await refreshDetail(selectedId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSendPushInvite() {
    if (!selectedId || !pushTargetUrl.trim()) return;
    setPushSending(true);
    try {
      await invoke("send_alliance_push_invite", {
        allianceId: selectedId,
        targetHubUrl: pushTargetUrl.trim(),
        ownHubUrl: ownHubUrl,
        message: pushMessage.trim() || null,
      });
      setPushTargetUrl("");
      setPushMessage("");
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setPushSending(false);
    }
  }

  const sharedChannelIds = new Set(shared.map((s) => s.channel_id));

  const rootItems = channels
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.display_order - b.display_order);

  function getChildren(parentId: string) {
    return channels
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.display_order - b.display_order);
  }

  function categorySharedState(catId: string): "all" | "some" | "none" {
    const children = getChildren(catId).filter((c) => !c.is_category);
    if (children.length === 0) return "none";
    const sharedCount = children.filter((c) => sharedChannelIds.has(c.id)).length;
    if (sharedCount === children.length) return "all";
    if (sharedCount > 0) return "some";
    return "none";
  }

  async function handleToggleCategoryShare(catId: string) {
    if (!selectedId) return;
    const children = getChildren(catId).filter((c) => !c.is_category);
    const state = categorySharedState(catId);
    const shouldShare = state === "none";
    for (const ch of children) {
      const isShared = sharedChannelIds.has(ch.id);
      if (shouldShare && !isShared) {
        await invoke("share_channel_with_alliance", { allianceId: selectedId, channelId: ch.id });
      } else if (!shouldShare && isShared) {
        await invoke("unshare_channel_from_alliance", { allianceId: selectedId, channelId: ch.id });
      }
    }
    await refreshDetail(selectedId);
  }

  const tabLabels: Record<AllianceTab, string> = {
    members: t("alliances.tab.members"),
    channels: t("alliances.tab.channels"),
    invite: t("alliances.tab.invite"),
  };

  return (
    <section>
      <h1>{t("alliances.title")}</h1>
      <p className="muted">
        {t("alliances.hint")}
      </p>

      <div className="alliances-layout">
        <div className="alliances-list-panel">
          <div className="alliances-list">
            {alliances.length === 0 && !isCreating && (
              <p className="alliances-empty-hint muted">{t("alliances.empty")}</p>
            )}
            {alliances.map((a) => (
              <button
                key={a.id}
                className={`alliance-list-item${selectedId === a.id ? " active" : ""}`}
                onClick={() => { setSelectedId(a.id); setIsCreating(false); }}
              >
                {a.name}
              </button>
            ))}
            {isCreating && (
              <div className="alliance-create-inline">
                <input
                  ref={createInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("alliances.new.placeholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setIsCreating(false); setNewName(""); }
                  }}
                />
                <div className="alliance-create-inline-actions">
                  <button onClick={handleCreate} disabled={!newName.trim()}>{t("modal.create")}</button>
                  <button
                    className="btn-secondary"
                    onClick={() => { setIsCreating(false); setNewName(""); }}
                  >
                    {t("modal.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isCreating && (
            <button
              className="alliance-list-add"
              onClick={() => setIsCreating(true)}
              title={t("alliances.new.title")}
            >
              {t("alliances.new")}
            </button>
          )}
        </div>

        <div className="alliances-detail-panel">
          {error && (
            <div className="error-banner alliances-error">
              {error}
              <button className="btn-icon-small" onClick={() => setError(null)} aria-label="Dismiss" title="Dismiss">×</button>
            </div>
          )}

          {selectedId && detail ? (
            <>
              <div className="alliances-detail-header">
                <h2 className="alliances-detail-name">{detail.name}</h2>
                <button className="btn-secondary-small" onClick={handleLeave}>
                  {t("alliances.detail.leave")}
                </button>
              </div>

              <div className="alliances-tab-bar">
                {(["members", "channels", "invite"] as AllianceTab[]).map((tabId) => (
                  <button
                    key={tabId}
                    className={`alliances-tab${tab === tabId ? " active" : ""}`}
                    onClick={() => setTab(tabId)}
                  >
                    {tabLabels[tabId]}
                  </button>
                ))}
              </div>

              <div className="alliances-tab-content">
                {tab === "members" && (
                  <ul className="alliance-members">
                    {detail.members.map((m) => (
                      <li key={m.hub_public_key}>
                        <strong>{m.hub_name}</strong>
                        <span className="muted"> — {m.hub_url}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "channels" && (
                  <>
                    <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
                      {t("alliances.channels.hint")}
                    </p>
                    {rootItems.length === 0 ? (
                      <p className="muted">{t("alliances.channels.empty")}</p>
                    ) : (
                      <div className="alliance-channel-tree">
                        {rootItems.map((item) => {
                          if (item.is_category) {
                            const catState = categorySharedState(item.id);
                            const collapsed = collapsedCats.has(item.id);
                            const children = getChildren(item.id).filter((c) => !c.is_category);
                            return (
                              <div key={item.id} className="act-category">
                                <div className="act-category-header">
                                  <button
                                    className="act-collapse-btn"
                                    onClick={() => setCollapsedCats((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                      return next;
                                    })}
                                  >
                                    {collapsed ? "▸" : "▾"}
                                  </button>
                                  <label className="checkbox-label act-category-label">
                                    <input
                                      type="checkbox"
                                      checked={catState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = catState === "some"; }}
                                      onChange={() => handleToggleCategoryShare(item.id)}
                                    />
                                    <strong>{item.name.toUpperCase()}</strong>
                                  </label>
                                </div>
                                {!collapsed && children.length > 0 && (
                                  <div className="act-children">
                                    {children.map((ch) => {
                                      const isShared = sharedChannelIds.has(ch.id);
                                      return (
                                        <label key={ch.id} className="checkbox-label act-channel">
                                          <input
                                            type="checkbox"
                                            checked={isShared}
                                            onChange={() => handleToggleShare(ch.id, isShared)}
                                          />
                                          # {ch.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            const isShared = sharedChannelIds.has(item.id);
                            return (
                              <label key={item.id} className="checkbox-label act-channel act-toplevel">
                                <input
                                  type="checkbox"
                                  checked={isShared}
                                  onChange={() => handleToggleShare(item.id, isShared)}
                                />
                                # {item.name}
                              </label>
                            );
                          }
                        })}
                      </div>
                    )}
                  </>
                )}

                {tab === "invite" && (
                  <div className="alliance-invite-tab">
                    <div className="alliance-invite-section">
                      <label className="settings-label" htmlFor="alliance-push-url">{t("alliances.invite.push.label")}</label>
                      <p className="muted">
                        {t("alliances.invite.push.hint")}
                      </p>
                      <div className="alliance-join-row">
                        <input
                          id="alliance-push-url"
                          type="text"
                          value={pushTargetUrl}
                          onChange={(e) => setPushTargetUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !pushMessage) handleSendPushInvite(); }}
                          placeholder={t("alliances.invite.push.placeholder")}
                          disabled={pushSending}
                        />
                      </div>
                      <textarea
                        value={pushMessage}
                        onChange={(e) => setPushMessage(e.target.value)}
                        placeholder={t("alliances.invite.push.message_placeholder")}
                        rows={2}
                        disabled={pushSending}
                        style={{ marginTop: "var(--space-2)", resize: "vertical" }}
                      />
                      <button
                        onClick={handleSendPushInvite}
                        disabled={!pushTargetUrl.trim() || pushSending}
                        style={{ marginTop: "var(--space-2)" }}
                      >
                        {pushSending ? t("alliances.invite.push.sending") : t("alliances.invite.push.send")}
                      </button>
                    </div>

                    <div className="alliance-invite-section">
                      <label className="settings-label">{t("alliances.invite.code.label")}</label>
                      <p className="muted">
                        {t("alliances.invite.code.hint")}
                      </p>
                      <button className="btn-secondary" onClick={handleGenerateInvite}>
                        {invite && invite.alliance_id === selectedId
                          ? t("alliances.invite.code.regenerate")
                          : t("alliances.invite.code.generate")}
                      </button>
                      {invite && invite.alliance_id === selectedId && (() => {
                        const shareCode = btoa(JSON.stringify({
                          u: ownHubUrl,
                          a: invite.alliance_id,
                          t: invite.token,
                        }));
                        return (
                          <div className="alliance-share-code-block">
                            <p className="muted">{t("alliances.invite.code.share_hint")}</p>
                            <div className="alliance-share-code-row">
                              <code className="alliance-share-code">{shareCode}</code>
                              <button
                                className="btn-secondary"
                                onClick={() => navigator.clipboard.writeText(shareCode).catch(() => {})}
                                title="Copy to clipboard"
                              >
                                {t("alliances.invite.code.copy")}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="alliance-invite-section">
                      <label className="settings-label" htmlFor="alliance-join-code">{t("alliances.join.label")}</label>
                      <p className="muted">
                        {t("alliances.join.hint")}
                      </p>
                      <div className="alliance-join-row">
                        <input
                          id="alliance-join-code"
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                          placeholder={t("alliances.join.placeholder")}
                        />
                        <button onClick={handleJoin} disabled={!joinCode.trim()}>
                          {t("alliances.join.button")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="alliances-no-selection">
              <p className="muted">
                {t("alliances.no_selection")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
