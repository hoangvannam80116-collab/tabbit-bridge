import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_CDP_PORT, TABBIT_APP_PATH } from "./config.js";

const execFileAsync = promisify(execFile);
const TABBIT_MAIN_PROCESS = "Tabbit Browser.app/Contents/MacOS/Tabbit Browser";
const TABBIT_MAIN_PATH = "/Applications/Tabbit Browser.app/Contents/MacOS/Tabbit Browser";

export async function isTabbitRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,stat=,command="], {
      maxBuffer: 1024 * 1024 * 4,
    });
    return stdout
      .split("\n")
      .some((line) => {
        const trimmed = line.trim();
        if (!trimmed.includes(TABBIT_MAIN_PATH)) return false;
        const parts = trimmed.split(/\s+/, 3);
        const stat = parts[1] ?? "";
        return !/[ZE]/.test(stat);
      });
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

  const gracefulDeadline = Date.now() + 5000;
  while (Date.now() < gracefulDeadline) {
    if (!(await isTabbitRunning())) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    await execFileAsync("pkill", ["-f", TABBIT_MAIN_PROCESS]);
  } catch {
    // Ignore if the process exited between checks.
  }

  const forcedDeadline = Date.now() + 3000;
  while (Date.now() < forcedDeadline) {
    if (!(await isTabbitRunning())) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
