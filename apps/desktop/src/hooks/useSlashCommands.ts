import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppProfile } from "../types";

export interface SlashCommandEntry {
  command: string;
  description: string;
  app_name: string;
}

// Slash command autocomplete entries — populated after hub load. The app
// listing already carries each app's commands, so this is one call.
export function useSlashCommands() {
  const [slashCommands, setSlashCommands] = useState<SlashCommandEntry[]>([]);

  async function loadSlashCommands(hubUrl: string) {
    try {
      const apps = await invoke<AppProfile[]>("list_apps", { hubUrl });
      setSlashCommands(
        apps.flatMap((app) =>
          app.commands.map((cmd) => ({
            command: cmd.name,
            description: cmd.description,
            app_name: app.name,
          }))
        )
      );
    } catch {
      setSlashCommands([]);
    }
  }

  function clearSlashCommands() {
    setSlashCommands([]);
  }

  return { slashCommands, loadSlashCommands, clearSlashCommands };
}
