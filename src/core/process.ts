import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_CDP_PORT, TABBIT_APP_PATH } from "./config.js";

const execFileAsync = promisify(execFile);

export async function isTabbitRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", "Tabbit Browser.app/Contents/MacOS/Tabbit Browser"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function openTabbitWithDebugging(port = DEFAULT_CDP_PORT): Promise<void> {
  await execFileAsync("open", [
    "-na",
    TABBIT_APP_PATH,
    "--args",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
  ]);
}

export async function quitTabbit(): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", 'quit app "Tabbit Browser"']);
  } catch {
    // Ignore when the app is not running.
  }
}
