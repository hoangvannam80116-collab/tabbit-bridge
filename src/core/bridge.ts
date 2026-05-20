import { DEFAULT_CDP_PORT, defaultDownloadDirectory, stateDirectory } from "./config.js";
import { TabbitCdp } from "./cdp.js";
import { TabbitChat } from "./chat.js";
import { DownloadsManager } from "./downloads.js";
import { isTabbitRunning, openTabbitWithDebugging, quitTabbit } from "./process.js";
import { StateStore } from "./state.js";
import type { BridgeStatus } from "./types.js";

export class TabbitBridge {
  readonly cdp: TabbitCdp;
  readonly chat: TabbitChat;
  readonly downloads: DownloadsManager;
  readonly state: StateStore;

  constructor(private readonly cdpPort = DEFAULT_CDP_PORT) {
    this.cdp = new TabbitCdp(cdpPort);
    this.chat = new TabbitChat(this.cdp);
    this.state = new StateStore();
    this.downloads = new DownloadsManager(defaultDownloadDirectory(), this.state);
  }

  async status(): Promise<BridgeStatus> {
    const [tabbitRunning, cdpReachable] = await Promise.all([
      isTabbitRunning(),
      this.cdp.isReachable(),
    ]);
    const tabs = cdpReachable ? (await this.cdp.listTabs()).length : 0;
    return {
      tabbitRunning,
      cdpReachable,
      cdpPort: this.cdpPort,
      downloadDirectory: this.downloads.getDirectory(),
      tabs,
      stateDirectory: stateDirectory(),
    };
  }

  async ensureDebugging(): Promise<BridgeStatus> {
    const status = await this.status();
    if (status.cdpReachable) return status;
    if (status.tabbitRunning) {
      await quitTabbit();
    }
    await openTabbitWithDebugging(this.cdpPort);

    const deadline = Date.now() + 10000;
    let latest = await this.status();
    while (!latest.cdpReachable && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      latest = await this.status();
    }
    return latest;
  }
}
