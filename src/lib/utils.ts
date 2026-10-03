import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isDatabaseWorkspaceEnabled } from "./workspace-flags";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  if (isDatabaseWorkspaceEnabled() && ["emp", "tpl", "matter", "task", "evt", "draft"].includes(prefix)) return crypto.randomUUID();
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
