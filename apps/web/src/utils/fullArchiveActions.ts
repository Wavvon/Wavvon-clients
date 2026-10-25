import { decryptArchive, encryptArchive, suggestArchiveFilename, type SubkeyCert } from "@wavvon/core";
import { parseArchiveDocument, planRestore, type FullArchiveSectionActions } from "@wavvon/ui";
import { listAccounts, resolveOrCreateAccount, switchAccount, SWITCH_BLOCKED_COOLDOWN } from "@identity/index";
import { assembleArchive } from "./dataExport";
import { applyRestorePlan, readExistingAccountSnapshot, type ArchiveIdentityInput } from "./archiveRestore";
import { newCustomThemeId } from "./customThemes";

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickArchiveFile(): Promise<{ name: string; source: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".enc,application/octet-stream,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then((source) => resolve({ name: file.name, source }), () => resolve(null));
    };
    input.click();
  });
}

export function buildFullArchiveActions(cooldownMessage: string): FullArchiveSectionActions {
  return {
    async exportArchive(passphrase, onProgress) {
      const archive = await assembleArchive({ onProgress });
      const envelope = await encryptArchive(JSON.stringify(archive, null, 2), passphrase);
      download(JSON.stringify(envelope, null, 2), suggestArchiveFilename());
    },
    pickArchive: pickArchiveFile,
    async restoreArchive(source, passphrase) {
      const archive = parseArchiveDocument(await decryptArchive(source, passphrase));
      const wasFirstAccount = (await listAccounts()).length === 0;
      const identity = archive.identity as unknown as ArchiveIdentityInput;
      const { account } = await resolveOrCreateAccount(identity.seed_hex, {
        master_pubkey: identity.master_pubkey,
        device_label: identity.device_label,
        subkey_cert: identity.subkey_cert as SubkeyCert | undefined,
        account_label: identity.account_label,
      });
      const plan = planRestore(archive, readExistingAccountSnapshot(account.id), newCustomThemeId);
      applyRestorePlan(account.id, plan);
      return { accountId: account.id, summary: plan.summary, wasFirstAccount };
    },
    async switchAccount(id) {
      const refused = switchAccount(id, "settings-account");
      if (!refused) return null;
      return refused === SWITCH_BLOCKED_COOLDOWN ? cooldownMessage : refused;
    },
  };
}
