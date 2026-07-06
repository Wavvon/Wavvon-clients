import { hubFetch } from "../http";

export interface NativeBot {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  webhook_url?: string;
}

export interface NativeBotCreated extends NativeBot {
  token: string;
  mini_app_url?: string;
  requires_camera: boolean;
}

// Native (first-party) bots living on this hub — distinct from external bots.
export async function listNativeBots(): Promise<NativeBot[]> {
  const r = await hubFetch("/admin/bots");
  return r.json() as Promise<NativeBot[]>;
}

export async function createNativeBot(input: {
  display_name: string;
  mini_app_url?: string;
  requires_camera?: boolean;
}): Promise<NativeBotCreated> {
  const r = await hubFetch("/admin/bots", { method: "POST", body: JSON.stringify(input) });
  return r.json() as Promise<NativeBotCreated>;
}

export async function deleteNativeBot(pubkey: string): Promise<void> {
  await hubFetch(`/admin/bots/${pubkey}`, { method: "DELETE" });
}
