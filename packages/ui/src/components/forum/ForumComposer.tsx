import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ForumTagDef } from "../../types";
import { describeForumWriteError } from "./forumErrors";
import { ForumTagPicker } from "./ForumTagPicker";
import { toggleTagSelection } from "../../utils/forumTags";
import { AutoGrowTextarea } from "../profile/AutoGrowTextarea";
import { EmojiPicker } from "../content/EmojiPicker";
import type { ForumActions } from "./ForumView";

// 5 text rows at the --leading-normal line-height (1.5 * 14px).
const COMPOSER_MIN_HEIGHT = 5 * 21;

interface Props {
  channelId: string;
  actions: Pick<ForumActions, "createPost" | "createAlliancePost" | "listTags" | "uploadAttachment">;
  onCreated: (postId: string) => void;
  onCancel: () => void;
  /** Set when posting into an alliance-shared forum channel -- routes the
   * create through the alliance write-proxy instead of the local endpoint. */
  allianceId?: string;
  /** Channel setting (forum.md §10.1) -- block submit with no tags chosen. */
  forumRequireTag?: boolean;
  /** Admin-only discoverability hint: the tag picker renders nothing when the
   * forum has no tag definitions, which reads as "tagging doesn't exist". */
  showNoTagsHint?: boolean;
}

interface PendingFile {
  file: File;
  objectUrl: string;
}

export function ForumComposer({ channelId, actions, onCreated, onCancel, allianceId, forumRequireTag, showNoTagsHint }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<ForumTagDef[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    // Alliance composers never carry tags (forum.md §10.4 -- remote writes
    // don't assign the owner's tags in v1).
    if (allianceId || !actions.listTags) return;
    actions.listTags(channelId).then(setTags).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, allianceId, actions.listTags]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    const next = picked.map((f) => ({ file: f, objectUrl: URL.createObjectURL(f) }));
    setPendingFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(objectUrl: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.objectUrl === objectUrl);
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return prev.filter((f) => f.objectUrl !== objectUrl);
    });
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    if (!allianceId && forumRequireTag && selectedTagIds.length === 0) {
      setError("Pick at least one tag before posting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Upload every pending file before creating the post -- a partial
      // upload failure must not leave a post with some attachments missing.
      const attachments = actions.uploadAttachment && pendingFiles.length > 0
        ? await Promise.all(pendingFiles.map((f) => actions.uploadAttachment!(channelId, f.file)))
        : undefined;
      const result = allianceId
        ? await actions.createAlliancePost!(allianceId, channelId, title.trim(), body.trim())
        : await actions.createPost(channelId, title.trim(), body.trim(), selectedTagIds, attachments);
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      onCreated(result.id);
    } catch (e) {
      setError(describeForumWriteError(e, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="forum-composer">
      <h2>{t("forum.composer.title")}</h2>
      <div className="settings-section">
        <label className="settings-label" htmlFor="forum-title">{t("forum.composer.title_label")}</label>
        <input
          id="forum-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("forum.composer.title_placeholder")}
          maxLength={200}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label" htmlFor="forum-body">{t("forum.composer.body_label")}</label>
        <AutoGrowTextarea
          id="forum-body"
          className="forum-composer-textarea"
          value={body}
          onChange={setBody}
          placeholder={t("forum.composer.body_placeholder")}
          minHeight={COMPOSER_MIN_HEIGHT}
        />
        <div className="settings-row" style={{ marginTop: 4 }}>
          <EmojiPicker buttonClassName="composer-btn" onPick={(emoji) => setBody((prev) => prev + emoji)} />
        </div>
      </div>
      {!allianceId && (
        <ForumTagPicker
          tags={tags}
          selected={selectedTagIds}
          onToggle={(id) => setSelectedTagIds((prev) => toggleTagSelection(prev, id))}
        />
      )}
      {!allianceId && showNoTagsHint && tags.length === 0 && (
        <p className="muted">{t("forum.no_tags_hint")}</p>
      )}
      {actions.uploadAttachment && !allianceId && (
        <div className="settings-section">
          <label className="settings-label">{t("forum.composer.attachments")}</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("forum.composer.attach")}
          </button>
          {pendingFiles.length > 0 && (
            <ul className="forum-pending-attachments">
              {pendingFiles.map((f) => (
                <li key={f.objectUrl} className="forum-pending-attachment-row">
                  <span>{f.file.name}</span>
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={() => removeFile(f.objectUrl)}
                    aria-label={`Remove ${f.file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="settings-row" style={{ gap: 8 }}>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
        >
          {submitting ? t("forum.composer.posting") : t("forum.composer.post")}
        </button>
        <button className="btn-secondary" onClick={onCancel}>{t("forum.composer.cancel")}</button>
      </div>
    </div>
  );
}
