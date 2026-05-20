import { DEFAULT_CDP_PORT } from "./config.js";
import { getJson } from "./http.js";
import type { JsonValue, PageInspection, TabInfo } from "./types.js";

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private socket?: WebSocket;

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.socket = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error("WebSocket was not created"));
      const timer = setTimeout(() => reject(new Error("Timed out connecting to CDP")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to connect to CDP WebSocket"));
      }, { once: true });
      this.socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("CDP WebSocket is not open");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
    socket.send(payload);
    return result;
  }

  close(): void {
    this.socket?.close();
  }

  private handleMessage(raw: string): void {
    let message: CdpResponse;
    try {
      message = JSON.parse(raw) as CdpResponse;
    } catch {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }
    pending.resolve(message.result);
  }
}

export class TabbitCdp {
  constructor(private readonly port = DEFAULT_CDP_PORT) {}

  async version(): Promise<Record<string, unknown>> {
    return getJson<Record<string, unknown>>(`http://127.0.0.1:${this.port}/json/version`);
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.version();
      return true;
    } catch {
      return false;
    }
  }

  async listTabs(): Promise<TabInfo[]> {
    const tabs = await getJson<TabInfo[]>(`http://127.0.0.1:${this.port}/json/list`);
    return tabs
      .filter((tab) => tab.type === "page")
      .map((tab, index) => ({
        ...tab,
        active: index === 0,
      }));
  }

  async openTab(url: string): Promise<TabInfo> {
    const encoded = encodeURIComponent(url);
    return getJson<TabInfo>(`http://127.0.0.1:${this.port}/json/new?${encoded}`);
  }

  async closeTab(id: string): Promise<unknown> {
    return getJson<unknown>(`http://127.0.0.1:${this.port}/json/close/${encodeURIComponent(id)}`);
  }

  async activateTab(id: string): Promise<unknown> {
    return getJson<unknown>(`http://127.0.0.1:${this.port}/json/activate/${encodeURIComponent(id)}`);
  }

  async currentTab(): Promise<TabInfo> {
    const tabs = await this.listTabs();
    const page = tabs.find((tab) => isContentPage(tab.url)) ?? tabs.find((tab) => tab.url && !tab.url.startsWith("devtools://"));
    if (!page) throw new Error("No Tabbit page tab is available through CDP");
    return page;
  }

  async sidebarTab(): Promise<TabInfo> {
    const tabs = await this.listTabs();
    const sidebar = tabs.find((tab) => tab.url.includes("web.tabbit-ai.com/sidebar"));
    if (!sidebar) throw new Error("Tabbit sidebar Chat target is not available through CDP");
    return sidebar;
  }

  async evaluate<T = JsonValue>(expression: string, tabId?: string): Promise<T> {
    const tab = tabId
      ? (await this.listTabs()).find((candidate) => candidate.id === tabId)
      : await this.currentTab();
    if (!tab?.webSocketDebuggerUrl) {
      throw new Error(`Tab ${tabId ?? "current"} does not expose a CDP WebSocket URL`);
    }

    const client = new CdpClient(tab.webSocketDebuggerUrl);
    try {
      const result = await client.send<{ result: { value?: T; unserializableValue?: string }; exceptionDetails?: unknown }>(
        "Runtime.evaluate",
        {
          expression,
          returnByValue: true,
          awaitPromise: true,
        },
      );
      if (result.exceptionDetails) {
        throw new Error(`Page evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
      }
      return result.result.value as T;
    } finally {
      client.close();
    }
  }

  async inspectPage(tabId?: string): Promise<PageInspection> {
    const script = `(() => {
      const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const visibleText = clean(document.body?.innerText || "");
      return {
        title: document.title,
        url: location.href,
        textPreview: visibleText.slice(0, 4000),
        headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((el) => clean(el.textContent)).filter(Boolean).slice(0, 80),
        links: Array.from(document.querySelectorAll("a[href]")).map((el) => ({ text: clean(el.textContent), href: el.href })).filter((item) => item.text || item.href).slice(0, 120),
        buttons: Array.from(document.querySelectorAll("button,[role=button]")).map((el) => clean(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"))).filter(Boolean).slice(0, 120),
        inputs: Array.from(document.querySelectorAll("input,textarea,[contenteditable],[role=textbox]")).map((el) => ({
          type: el.getAttribute("type") || el.tagName.toLowerCase(),
          name: el.getAttribute("name") || el.getAttribute("aria-label") || "",
          placeholder: el.getAttribute("placeholder") || ""
        })).slice(0, 120)
      };
    })()`;
    return this.evaluate<PageInspection>(script, tabId);
  }
}

function isContentPage(url: string): boolean {
  if (!url || url.startsWith("devtools://")) return false;
  if (url.includes("web.tabbit-ai.com/sidebar")) return false;
  if (url.includes("web.tabbit-ai.com/newtab")) return false;
  if (url.startsWith("chrome-extension://")) return false;
  return /^https?:\/\//.test(url);
}
