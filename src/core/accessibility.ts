import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TABBIT_APP_NAME } from "./config.js";

const execFileAsync = promisify(execFile);

function jxaString(value: string): string {
  return JSON.stringify(value);
}

async function runJxa(script: string): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

export async function activateTabbit(): Promise<void> {
  await runJxa(`
    const app = Application(${jxaString(TABBIT_APP_NAME)});
    app.activate();
  `);
}

export async function pressButtonByText(text: string): Promise<boolean> {
  const output = await runJxa(`
    const system = Application("System Events");
    const proc = system.processes.byName(${jxaString(TABBIT_APP_NAME)});
    proc.frontmost = true;
    function attrs(el) {
      const out = {};
      for (const name of ["AXTitle", "AXDescription", "AXHelp", "AXValue"]) {
        try { out[name] = el.attributes.byName(name).value(); } catch {}
      }
      return out;
    }
    function children(el) {
      try { return el.uiElements(); } catch { return []; }
    }
    function walk(el) {
      const a = attrs(el);
      const hay = Object.values(a).join(" ");
      if (hay.includes(${jxaString(text)})) {
        try { el.actions.byName("AXPress").perform(); return true; } catch {}
      }
      for (const child of children(el)) {
        if (walk(child)) return true;
      }
      return false;
    }
    JSON.stringify({ pressed: walk(proc) });
  `);
  try {
    return Boolean(JSON.parse(output).pressed);
  } catch {
    return false;
  }
}

export async function focusLikelyChatInput(): Promise<boolean> {
  const output = await runJxa(`
    const system = Application("System Events");
    const proc = system.processes.byName(${jxaString(TABBIT_APP_NAME)});
    proc.frontmost = true;
    const needles = ["在页面划词", "截图提问", "输入", "唤起妙招"];
    function role(el) {
      try { return String(el.attributes.byName("AXRole").value()); } catch { return ""; }
    }
    function value(el, name) {
      try { return String(el.attributes.byName(name).value() || ""); } catch { return ""; }
    }
    function children(el) {
      try { return el.uiElements(); } catch { return []; }
    }
    function candidate(el) {
      const r = role(el);
      const hay = [value(el, "AXTitle"), value(el, "AXDescription"), value(el, "AXHelp"), value(el, "AXValue")].join(" ");
      return (r === "AXTextArea" || r === "AXTextField" || r === "AXComboBox") &&
        (needles.some((n) => hay.includes(n)) || hay.length === 0);
    }
    function walk(el) {
      if (candidate(el)) {
        try { el.actions.byName("AXPress").perform(); return true; } catch {}
      }
      for (const child of children(el)) {
        if (walk(child)) return true;
      }
      return false;
    }
    JSON.stringify({ focused: walk(proc) });
  `);
  try {
    return Boolean(JSON.parse(output).focused);
  } catch {
    return false;
  }
}

export async function pasteTextAndSubmit(text: string): Promise<void> {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  await runJxa(`
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    const decoded = $.NSString.alloc.initWithDataEncoding(
      $.NSData.alloc.initWithBase64EncodedStringOptions(${jxaString(encoded)}, 0),
      $.NSUTF8StringEncoding
    ).js;
    app.setTheClipboardTo(decoded);
    const system = Application("System Events");
    system.keystroke("v", { using: "command down" });
    delay(0.2);
    system.keyCode(36);
  `);
}

export async function readVisibleText(limit = 12000): Promise<string> {
  const output = await runJxa(`
    const system = Application("System Events");
    const proc = system.processes.byName(${jxaString(TABBIT_APP_NAME)});
    function value(el, name) {
      try { return String(el.attributes.byName(name).value() || ""); } catch { return ""; }
    }
    function role(el) {
      try { return String(el.attributes.byName("AXRole").value()); } catch { return ""; }
    }
    function children(el) {
      try { return el.uiElements(); } catch { return []; }
    }
    const parts = [];
    function walk(el) {
      const r = role(el);
      if (["AXStaticText", "AXTextArea", "AXTextField", "AXButton", "AXGroup"].includes(r)) {
        const text = [value(el, "AXTitle"), value(el, "AXDescription"), value(el, "AXValue")].filter(Boolean).join(" ");
        if (text) parts.push(text);
      }
      for (const child of children(el)) {
        if (parts.join("\\n").length > ${Number(limit)}) break;
        walk(child);
      }
    }
    walk(proc);
    JSON.stringify({ text: parts.join("\\n").slice(0, ${Number(limit)}) });
  `);
  try {
    return String(JSON.parse(output).text ?? "");
  } catch {
    return output;
  }
}
