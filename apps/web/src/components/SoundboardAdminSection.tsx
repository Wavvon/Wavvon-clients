import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SoundboardClip } from "../types";
import {
  listSoundboardClips,
  uploadSoundboardClip,
  deleteSoundboardClip,
  fetchSoundboardAudioBytes,
} from "@platform";
import { HubApiError } from "../platform/http";
import { formatPubkey } from "@wavvon/core";
import { EmojiPicker } from "./EmojiPicker";

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function SoundboardAdminSection() {
  const { t } = useTranslation();
  const [clips, setClips] = useState<SoundboardClip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function load() {
    try {
      const list = await listSoundboardClips();
      setClips(list);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleUpload() {
    if (!name.trim() || !file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadSoundboardClip(name.trim(), emoji, file);
      setName("");
      setEmoji(null);
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("hub.admin.soundboard.delete_confirm"))) return;
    setError(null);
    try {
      await deleteSoundboardClip(id);
      await load();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  async function handlePreviewPlay(clip: SoundboardClip) {
    setError(null);
    try {
      const bytes = await fetchSoundboardAudioBytes(clip.id);
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/ogg" }));
      setPlayingId(clip.id);
      const audio = new Audio(url);
      audio.onended = () => { setPlayingId((cur) => (cur === clip.id ? null : cur)); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (e) {
      setPlayingId(null);
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  return (
    <section>
      <h1>{t("hub.admin.soundboard.title")}</h1>
      <p className="muted">{t("hub.admin.soundboard.hint")}</p>

      {error && <p className="error-text">{error}</p>}

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.soundboard.name_label")}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
      </div>
      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.soundboard.emoji_label")}</label>
        <div className="settings-row">
          {emoji && <span style={{ fontSize: 20 }}>{emoji}</span>}
          <EmojiPicker onPick={setEmoji} />
          {emoji && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setEmoji(null)}>
              {t("modal.clear")}
            </button>
          )}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.soundboard.file_label")}</label>
        <input
          type="file"
          accept="audio/ogg,.ogg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {previewUrl && (
          <audio controls src={previewUrl} style={{ display: "block", marginTop: "var(--space-2)" }} />
        )}
      </div>
      <div className="settings-section">
        <button onClick={handleUpload} disabled={uploading || !name.trim() || !file}>
          {uploading ? t("hub.admin.soundboard.uploading") : t("hub.admin.soundboard.upload_button")}
        </button>
      </div>

      {clips === null ? (
        <p className="muted">{t("modal.loading")}</p>
      ) : clips.length === 0 ? (
        <p className="muted">{t("hub.admin.soundboard.empty")}</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>{t("hub.admin.soundboard.col.emoji")}</th>
              <th>{t("hub.admin.soundboard.col.name")}</th>
              <th>{t("hub.admin.soundboard.col.uploader")}</th>
              <th>{t("hub.admin.soundboard.col.duration")}</th>
              <th>{t("hub.admin.soundboard.col.size")}</th>
              <th>{t("hub.admin.soundboard.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {clips.map((clip) => (
              <tr key={clip.id}>
                <td style={{ fontSize: 18, textAlign: "center" }}>{clip.emoji ?? "—"}</td>
                <td>{clip.name}</td>
                <td><span className="member-pk" title={clip.uploader}>{formatPubkey(clip.uploader)}</span></td>
                <td>{formatDuration(clip.duration_ms)}</td>
                <td>{formatSize(clip.size_bytes)}</td>
                <td style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button
                    className="btn-small btn-secondary"
                    disabled={playingId === clip.id}
                    onClick={() => handlePreviewPlay(clip)}
                  >
                    {playingId === clip.id ? "▶…" : t("hub.admin.soundboard.play")}
                  </button>
                  <button className="btn-small btn-secondary danger" onClick={() => handleDelete(clip.id)}>
                    {t("hub.admin.soundboard.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
