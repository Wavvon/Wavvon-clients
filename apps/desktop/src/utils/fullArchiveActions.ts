import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { suggestArchiveFilename, type Conversation, type DmMessageFull } from "@wavvon/core";
import {
  buildDmArchiveConversation,
  planRestore,
  type ArchiveHub,
  type DmArchiveConversation,
  type FullArchiveSectionActions,
  type RestorableArchive,
  type WavvonSkin,
} from "@wavvon/ui";
import { switchAccountGuarded, SWITCH_BLOCKED_COOLDOWN } from "../accounts/store";
import { loadAllDrafts, saveAllDrafts } from "./drafts";

// Device-wide on desktop, like drafts (useChannelMessages reads the same key).
const MENTION_PING_KEY = "wavvon.mentionPing";

/** archive.rs's ArchiveStores: the per-account files Rust owns. */
interface ArchiveStores {
  hub_list: ArchiveHub[];
  ignored_users: string[];
  voice_gains: Record<string, number>;
  skin: WavvonSkin | null;
}

interface OpenedArchive {
  account_id: string;
  was_first_account: boolean;
  archive: RestorableArchive;
  existing: ArchiveStores;
}

// The seed never reaches this file: Rust adds the identity on export and
// keeps it on restore, handing back the document without it.
export function buildFullArchiveActions(fileFilterName: string, cooldownMessage: string): FullArchiveSectionActions {
  const filters = [{ name: fileFilterName, extensions: ["enc"] }];
  return {
    async exportArchive(passphrase, onProgress) {
      const path = await save({ defaultPath: suggestArchiveFilename(), filters });
      if (!path) throw new Error("export_cancelled");
      const me = await invoke<string>("get_my_public_key");
      const conversations = await invoke<Conversation[]>("list_conversations");
      const dms: DmArchiveConversation[] = [];
      onProgress(0, conversations.length);
      for (const [i, conv] of conversations.entries()) {
        const messages = await invoke<DmMessageFull[]>("get_dm_messages", { conversationId: conv.id });
        dms.push(buildDmArchiveConversation(conv, messages, me));
        onProgress(i + 1, conversations.length);
      }
      await invoke("export_full_archive", {
        path,
        passphrase,
        sections: { dms, drafts: loadAllDrafts(), mention_ping_enabled: localStorage.getItem(MENTION_PING_KEY) !== "0" },
      });
    },
    async pickArchive() {
      const path = await open({ multiple: false, filters });
      if (typeof path !== "string") return null;
      return { name: path.split(/[\\/]/).pop() || path, source: path };
    },
    async restoreArchive(path, passphrase) {
      const { account_id, was_first_account, archive, existing } = await invoke<OpenedArchive>("open_full_archive", { path, passphrase });
      const plan = planRestore(
        archive,
        {
          hubList: existing.hub_list,
          drafts: loadAllDrafts(),
          themeNames: existing.skin ? [existing.skin.name] : [],
          ignoredUsers: existing.ignored_users,
          voiceGains: existing.voice_gains,
          hasMentionPingSetting: localStorage.getItem(MENTION_PING_KEY) !== null,
        },
        () => crypto.randomUUID(),
      );
      // Desktop holds one custom theme per account, so only an account
      // without one takes a theme from the archive; the rest count as skipped.
      const skin = existing.skin ? null : (plan.newThemes[0]?.skin ?? null);
      const kept = skin ? 1 : 0;
      await invoke("apply_full_archive_restore", {
        accountId: account_id,
        stores: { hub_list: plan.hubList, ignored_users: plan.ignoredUsers, voice_gains: plan.voiceGains, skin },
      });
      saveAllDrafts(plan.drafts);
      if (plan.mentionPingEnabled !== null) localStorage.setItem(MENTION_PING_KEY, plan.mentionPingEnabled ? "1" : "0");
      const summary = {
        ...plan.summary,
        themesRestored: kept,
        themesSkipped: plan.summary.themesSkipped + plan.newThemes.length - kept,
      };
      return { accountId: account_id, summary, wasFirstAccount: was_first_account };
    },
    async switchAccount(id) {
      const refused = await switchAccountGuarded(id);
      if (!refused) return null;
      return refused === SWITCH_BLOCKED_COOLDOWN ? cooldownMessage : refused;
    },
  };
}
