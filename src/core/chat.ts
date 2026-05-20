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

  async readVisible(limit = 12000): Promise<string> {
    return readVisibleText(limit);
  }

  async waitResult(options: { timeoutMs?: number; quietMs?: number } = {}): Promise<{ text: string; elapsedMs: number }> {
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
        return { text: last, elapsedMs: Date.now() - started };
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    return { text: last, elapsedMs: Date.now() - started };
  }

  private async tryDomOpenChat(): Promise<boolean> {
    if (!(await this.cdp.isReachable())) return false;
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
    const expression = `async () => {
      const prompt = ${JSON.stringify(prompt)};
      const selectors = [
        "textarea",
        "[contenteditable=true]",
        "input[type=text]",
        "[role=textbox]"
      ];
      const input = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((el) => {
          const text = [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.textContent].join(" ");
          return /页面划词|截图提问|输入|chat|message|prompt/i.test(text) || selectors.length > 0;
        });
      if (!input) return false;
      input.focus();
      if ("value" in input) {
        input.value = prompt;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        input.textContent = prompt;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
      }
      const buttons = Array.from(document.querySelectorAll("button,[role=button]"));
      const send = buttons.reverse().find((el) => /发送|send|submit|↑|➜|arrow/i.test(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || ""));
      if (send) {
        send.click();
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      }
      return true;
    }`;
    try {
      return Boolean(await this.cdp.evaluate<boolean>(`(${expression})()`));
    } catch {
      return false;
    }
  }
}
