import { invoke } from "@tauri-apps/api/core";
import type {
  RecoveryContactsSectionActions,
  RecoveryContactItem,
  RecoveryRequestBundle,
} from "@wavvon/ui";

interface RecoveryContactsResponse {
  owner_pubkey: string;
  contacts: RecoveryContactItem[];
  threshold: number;
}

/** The Tauri side of `RecoveryContactsSection`, in one place because two
 *  screens render that section — settings (your own contacts) and the hub
 *  admin page (the operator's view) — and a second copy is how they drift.
 *
 *  The admin queue is not wired on desktop: no Rust proxy for
 *  `admin/recovery/pending` exists, so those actions stay undefined and the
 *  shared component omits that part rather than showing a dead list. */
export function buildRecoveryActions(hubUrl: string): RecoveryContactsSectionActions {
  return {
    async getContacts() {
      const r = await invoke<RecoveryContactsResponse>("get_recovery_contacts", { hubUrl });
      return { threshold: r.threshold, contacts: r.contacts };
    },
    async setContacts(threshold, contactPubkeys) {
      await invoke("set_recovery_contacts", { hubUrl, threshold, contacts: contactPubkeys });
    },
    async removeContact(pubkey) {
      await invoke("remove_recovery_contact", { hubUrl, pubkey });
    },
    async openRotationRequest(oldPubkey, reason) {
      return invoke<RecoveryRequestBundle>("submit_rotation_request", { hubUrl, oldPubkey, reason });
    },
    async getRotationRequest(id) {
      return invoke<RecoveryRequestBundle>("get_rotation_request_bundle", { hubUrl, id });
    },
    async attestRotationRequest(bundle) {
      await invoke("attest_rotation_request", { hubUrl, id: bundle.id });
    },
  };
}
