import { TabbitCdp } from "./cdp.js";
import { activateTabbit, focusLikelyChatInput, pasteTextAndSubmit, pressButtonByText, readVisibleText } from "./accessibility.js";

export interface ChatSendResult {
  method: "dom" | "accessibility";
  sent: boolean;
  note?: string;
}

export class TabbitChat {
  constructor(private readonly cdp = new TabbitCdp()) {}

  async open(): Promise<{ opened: boolean; method: string }> {
    const domOpened = await this.tryDomOpenChat();
    if (domOpened) return { opened: true, method: "dom" };

    await activateTabbit();
    const pressed = await pressButtonByText("Chat");
    return { opened: pressed, method: "accessibility" };
  }

  async send(prompt: string): Promise<ChatSendResult> {
    const domSent = await this.tryDomSend(prompt);
    if (domSent) return { method: "dom", sent: true };

    await this.open();
    const focused = await focusLikelyChatInput();
    if (!focused) {
      return {
        method: "accessibility",
        sent: false,
        note: "Could not focus the Tabbit Chat input through Accessibility. Grant Accessibility permission or keep the Chat panel open.",
      };
    }
    await pasteTextAndSubmit(prompt);
    return { method: "accessibility", sent: true };
  }

  async confirmExecute(): Promise<{ clicked: boolean; text?: string; note?: string }> {
    const sidebar = await this.cdp.sidebarTab().catch(() => null);
    if (!sidebar) return { clicked: false, note: "Tabbit sidebar Chat target is not available" };

    return this.cdp.evaluate<{ clicked: boolean; text?: string; note?: string }>(
      `(() => {
        const buttons = Array.from(document.querySelectorAll("button,[role=button]"))
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              el,
              text: (el.innerText || el.textContent || "").trim(),
              title: el.getAttribute("title") || "",
              aria: el.getAttribute("aria-label") || "",
              rect,
              visible: rect.width > 0 && rect.height > 0
            };
          })
          .filter((item) => item.visible && !item.el.disabled);
        const execute = buttons
          .filter((item) => item.text === "执行" || item.title === "执行" || item.aria === "执行")
          .sort((a, b) => (b.rect.y - a.rect.y) || (b.rect.x - a.rect.x))[0];
        if (!execute) return { clicked: false, note: "No visible Execute button found" };
        execute.el.click();
        return { clicked: true, text: execute.text || execute.title || execute.aria };
      })()`,
      sidebar.id,
    );
  }

  async runTask(prompt: string, options: { timeoutMs?: number; quietMs?: number } = {}): Promise<{
    sent: ChatSendResult;
    firstResult: Awaited<ReturnType<TabbitChat["waitResult"]>>;
    confirm: { clicked: boolean; text?: string; note?: string };
    finalResult: Awaited<ReturnType<TabbitChat["waitResult"]>>;
  }> {
    const sent = await this.send(prompt);
    const firstResult = await this.waitResult({
      timeoutMs: Math.min(options.timeoutMs ?? 90000, 30000),
      quietMs: options.quietMs,
    });
    const needsConfirm = /仅聊天\s*执行|开启 Tabbit 智能代理模式|智能代理模式/.test(firstResult.text);
    const confirm = needsConfirm
      ? await this.confirmExecute()
      : { clicked: false, note: "No execution confirmation was requested" };
    const finalResult = confirm.clicked
      ? await this.waitResult({ timeoutMs: options.timeoutMs ?? 120000, quietMs: options.quietMs })
      : firstResult;
    return { sent, firstResult, confirm, finalResult };
  }

  async readVisible(limit = 12000): Promise<string> {
    const sidebar = await this.cdp.sidebarTab().catch(() => null);
    if (sidebar) {
      const text = await this.cdp.evaluate<string>(
        `(() => (document.body?.innerText || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, ${Number(limit)}))()`,
        sidebar.id,
      ).catch(() => "");
      if (text) return text;
    }
    return readVisibleText(limit);
  }

  async readLastResult(): Promise<string> {
    const sidebar = await this.cdp.sidebarTab().catch(() => null);
    if (sidebar) {
      const text = await this.cdp.evaluate<string>(
        `(() => {
          const blocks = Array.from(document.querySelectorAll("div"))
            .map((el) => {
              const cls = String(el.className || "");
              const text = (el.innerText || "").trim();
              const rect = el.getBoundingClientRect();
              return { el, cls, text, rect };
            })
            .filter((item) =>
              item.text &&
              item.rect.width > 20 &&
              item.rect.height > 10 &&
              item.cls.includes("flex items-start gap-2 w-full px-2") &&
              !item.el.querySelector('[class*="UserMessageReadonlyContent"]')
            );
          const last = blocks[blocks.length - 1];
          return last ? last.text : "";
        })()`,
        sidebar.id,
      ).catch(() => "");
      if (text) return text;
    }
    return "";
  }

  async waitResult(options: { timeoutMs?: number; quietMs?: number } = {}): Promise<{ text: string; lastResult: string; elapsedMs: number }> {
    const timeoutMs = options.timeoutMs ?? 120000;
    const quietMs = options.quietMs ?? 2500;
    const started = Date.now();
    let last = "";
    let lastChanged = Date.now();

    while (Date.now() - started < timeoutMs) {
      const text = await this.readVisible();
      if (text !== last) {
        last = text;
        lastChanged = Date.now();
      }
      if (last && Date.now() - lastChanged >= quietMs) {
        const lastResult = await this.readLastResult();
        if (!isTransientChatState(last, lastResult)) {
          return { text: last, lastResult, elapsedMs: Date.now() - started };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    return { text: last, lastResult: await this.readLastResult(), elapsedMs: Date.now() - started };
  }

  private async tryDomOpenChat(): Promise<boolean> {
    if (!(await this.cdp.isReachable())) return false;
    const sidebar = await this.cdp.sidebarTab().catch(() => null);
    if (sidebar) return true;
    const expression = `(() => {
      const candidates = Array.from(document.querySelectorAll("button,[role=button],a"));
      const chat = candidates.find((el) => /chat/i.test(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || ""));
      if (!chat) return false;
      chat.click();
      return true;
    })()`;
    try {
      return Boolean(await this.cdp.evaluate<boolean>(expression));
    } catch {
      return false;
    }
  }

  private async tryDomSend(prompt: string): Promise<boolean> {
    if (!(await this.cdp.isReachable())) return false;
    const sidebar = await this.cdp.sidebarTab().catch(() => null);
    if (!sidebar) return false;
    const expression = `async () => {
      const prompt = ${JSON.stringify(prompt)};
      const selectors = [
        "textarea",
        "[contenteditable]",
        "input[type=text]",
        "[role=textbox]"
      ];
      const input = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((el) => {
          const text = [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.textContent].join(" ");
          return /页面划词|截图提问|输入|chat|message|prompt/i.test(text) || el.getAttribute("role") === "textbox";
        });
      if (!input) return false;
      input.focus();
      if ("value" in input && input.tagName !== "DIV") {
        input.value = prompt;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, prompt);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      const buttons = Array.from(document.querySelectorAll("button,[role=button]"))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { el, rect, visible: rect.width > 0 && rect.height > 0 };
        })
        .filter((item) => item.visible && !item.el.disabled);
      const labeled = buttons.find((item) => /发送|send|submit|↑|➜|arrow/i.test(item.el.textContent || item.el.getAttribute("aria-label") || item.el.getAttribute("title") || ""));
      const inputRect = input.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const lowerRight = buttons
        .filter((item) =>
          item.rect.y >= inputRect.y &&
          item.rect.y <= Math.min(viewportHeight, inputRect.bottom + 260) &&
          item.rect.x >= inputRect.x
        )
        .sort((a, b) => (b.rect.y - a.rect.y) || (b.rect.x - a.rect.x))[0];
      const send = labeled?.el || lowerRight?.el;
      if (send) {
        send.click();
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
      return true;
    }`;
    try {
      return Boolean(await this.cdp.evaluate<boolean>(`(${expression})()`, sidebar.id));
    } catch {
      return false;
    }
  }
}

function isTransientChatState(text: string, lastResult: string): boolean {
  const tail = text.slice(-1200);
  const result = lastResult.trim();
  if (!result) return true;
  if (/思考中|执行中|操作中|跟随中|可继续补充信息/.test(tail)) return true;
  if (/^思考中$/.test(result)) return true;
  if (/跳转到指定URL\s*$/.test(result)) return true;
  if (/我将为您|我来帮您|执行步骤\s*$/.test(result) && !/DONE|任务完成|成功|已完成|页面已成功加载/.test(result)) return true;
  return false;
}
