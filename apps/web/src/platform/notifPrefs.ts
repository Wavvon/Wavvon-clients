import type { NotifLevel } from "@shared/types";
import { getScoped, setScoped } from "../utils/accountScope";

function key(hubUrl: string): string {
  return `wavvon.notif.${hubUrl}`;
}

export function getNotifPref(hubUrl: string): NotifLevel {
  try {
    const raw = getScoped(key(hubUrl));
    if (raw === "all" || raw === "mentions" || raw === "none") return raw;
  } catch {
    // storage unavailable
  }
  return "all";
}

export function setNotifPref(hubUrl: string, level: NotifLevel): void {
  try {
    setScoped(key(hubUrl), level);
  } catch {
    // storage unavailable
  }
}
