import { TabbitBridge } from "../core/bridge.js";
import type { JsonValue } from "../core/types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

const stringProperty = (description: string) => ({ type: "string", description });
const numberProperty = (description: string) => ({ type: "number", description });

export function createTools(bridge: TabbitBridge): ToolDefinition[] {
  return [
    {
      name: "tabbit.status",
      description: "Check Tabbit Browser, CDP, downloads, and state-store status.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.status(),
    },
    {
      name: "tabbit.launch",
      description: "Launch or relaunch Tabbit Browser with Chrome DevTools Protocol enabled.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.ensureDebugging(),
    },
    {
      name: "tabbit.tabs.list",
      description: "List Tabbit tabs exposed through CDP.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.cdp.listTabs(),
    },
    {
      name: "tabbit.tabs.new",
      description: "Open a new Tabbit tab for the supplied URL.",
      inputSchema: {
        type: "object",
        properties: { url: stringProperty("URL to open") },
        required: ["url"],
      },
      run: (args) => bridge.cdp.openTab(requiredString(args, "url")),
    },
    {
      name: "tabbit.tabs.activate",
      description: "Activate a Tabbit tab by CDP tab id.",
      inputSchema: {
        type: "object",
        properties: { id: stringProperty("CDP tab id") },
        required: ["id"],
      },
      run: (args) => bridge.cdp.activateTab(requiredString(args, "id")),
    },
    {
      name: "tabbit.tabs.close",
      description: "Close a Tabbit tab by CDP tab id.",
      inputSchema: {
        type: "object",
        properties: { id: stringProperty("CDP tab id") },
        required: ["id"],
      },
      run: (args) => bridge.cdp.closeTab(requiredString(args, "id")),
    },
    {
      name: "tabbit.page.inspect",
      description: "Inspect the active Tabbit page through DOM/CDP. Returns URL, title, headings, links, buttons, forms, and text preview.",
      inputSchema: {
        type: "object",
        properties: { tabId: stringProperty("Optional CDP tab id") },
      },
      run: (args) => bridge.cdp.inspectPage(optionalString(args, "tabId")),
    },
    {
      name: "tabbit.page.eval",
      description: "Evaluate JavaScript in a Tabbit page through CDP.",
      inputSchema: {
        type: "object",
        properties: {
          expression: stringProperty("JavaScript expression to evaluate"),
          tabId: stringProperty("Optional CDP tab id"),
        },
        required: ["expression"],
      },
      run: (args) => bridge.cdp.evaluate<JsonValue>(requiredString(args, "expression"), optionalString(args, "tabId")),
    },
    {
      name: "tabbit.chat.open",
      description: "Open or focus the right-side Tabbit Chat panel.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.chat.open(),
    },
    {
      name: "tabbit.chat.send",
      description: "Send a prompt to the right-side Tabbit Chat. Prefer this over direct page manipulation.",
      inputSchema: {
        type: "object",
        properties: { prompt: stringProperty("Instruction to send to Tabbit Chat") },
        required: ["prompt"],
      },
      run: (args) => bridge.chat.send(requiredString(args, "prompt")),
    },
    {
      name: "tabbit.chat.wait_result",
      description: "Wait until visible Tabbit Chat text becomes quiet, then return the visible text.",
      inputSchema: {
        type: "object",
        properties: {
          timeoutMs: numberProperty("Optional timeout in milliseconds"),
          quietMs: numberProperty("Optional quiet period in milliseconds"),
        },
      },
      run: (args) => bridge.chat.waitResult({
        timeoutMs: optionalNumber(args, "timeoutMs"),
        quietMs: optionalNumber(args, "quietMs"),
      }),
    },
    {
      name: "tabbit.chat.read_last",
      description: "Read visible text from Tabbit through macOS Accessibility.",
      inputSchema: {
        type: "object",
        properties: { limit: numberProperty("Maximum characters to return") },
      },
      run: (args) => bridge.chat.readVisible(optionalNumber(args, "limit") ?? 12000),
    },
    {
      name: "tabbit.chat.read_last_result",
      description: "Read only the latest Tabbit Chat assistant result when it can be extracted from the sidebar DOM.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.chat.readLastResult(),
    },
    {
      name: "tabbit.task.create",
      description: "Create a local Codex-managed task record for work delegated to Tabbit.",
      inputSchema: {
        type: "object",
        properties: { name: stringProperty("Task name") },
        required: ["name"],
      },
      run: (args) => bridge.state.createTask(requiredString(args, "name")),
    },
    {
      name: "tabbit.task.list",
      description: "List local Codex-managed Tabbit task records.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.state.listTasks(),
    },
    {
      name: "tabbit.task.status",
      description: "Read one local Tabbit task record.",
      inputSchema: {
        type: "object",
        properties: { id: stringProperty("Task id") },
        required: ["id"],
      },
      run: (args) => bridge.state.getTask(requiredString(args, "id")),
    },
    {
      name: "tabbit.task.update",
      description: "Update a task status and optional current-step note.",
      inputSchema: {
        type: "object",
        properties: {
          id: stringProperty("Task id"),
          status: stringProperty("pending, running, waiting, blocked, done, failed, or cancelled"),
          note: stringProperty("Optional status note"),
        },
        required: ["id", "status"],
      },
      run: (args) => bridge.state.setTaskStatus(requiredString(args, "id"), requiredString(args, "status") as never, optionalString(args, "note")),
    },
    {
      name: "tabbit.downloads.get_directory",
      description: "Return Tabbit's download directory.",
      inputSchema: { type: "object", properties: {} },
      run: () => bridge.downloads.getDirectory(),
    },
    {
      name: "tabbit.downloads.list",
      description: "List recent files in Tabbit's download directory.",
      inputSchema: {
        type: "object",
        properties: { limit: numberProperty("Maximum number of files") },
      },
      run: (args) => bridge.downloads.list(optionalNumber(args, "limit") ?? 50),
    },
    {
      name: "tabbit.downloads.wait",
      description: "Wait for a new completed file in Tabbit's download directory.",
      inputSchema: {
        type: "object",
        properties: {
          timeoutMs: numberProperty("Timeout in milliseconds"),
          taskId: stringProperty("Optional task id to attach the file to"),
        },
      },
      run: (args) => bridge.downloads.waitForNew({
        timeoutMs: optionalNumber(args, "timeoutMs"),
        taskId: optionalString(args, "taskId"),
      }),
    },
    {
      name: "tabbit.downloads.parse",
      description: "Parse a downloaded file and return Codex-readable content or preview.",
      inputSchema: {
        type: "object",
        properties: {
          path: stringProperty("Absolute file path"),
          taskId: stringProperty("Optional task id to attach parsed file to"),
        },
        required: ["path"],
      },
      run: (args) => bridge.downloads.parseAndRecord(requiredString(args, "path"), optionalString(args, "taskId")),
    },
  ];
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
