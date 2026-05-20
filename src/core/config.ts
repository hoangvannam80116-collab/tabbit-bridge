import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CDP_PORT = Number(process.env.TABBIT_CDP_PORT ?? "9222");
export const TABBIT_APP_NAME = process.env.TABBIT_APP_NAME ?? "Tabbit Browser";
export const TABBIT_APP_PATH =
  process.env.TABBIT_APP_PATH ?? "/Applications/Tabbit Browser.app";

export function stateDirectory(): string {
  const dir = process.env.TABBIT_BRIDGE_STATE_DIR ?? join(homedir(), ".tabbit-bridge");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultDownloadDirectory(): string {
  const prefsPath = join(
    homedir(),
    "Library/Application Support/Tabbit Browser/Default/Preferences",
  );

  if (existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
      const configured = prefs?.download?.default_directory;
      if (typeof configured === "string" && configured.length > 0) {
        return configured.replace(/^~/, homedir());
      }
    } catch {
      // Fall back below when Chromium preferences are locked or not JSON.
    }
  }

  return join(homedir(), "Downloads");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
