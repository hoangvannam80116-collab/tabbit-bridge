#!/usr/bin/env node
import { TabbitBridge } from "./core/bridge.js";

function print(value: unknown): void {
  if (typeof value === "string") {
    console.log(value);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

function usage(): void {
  console.log(`tabbit-bridge

Usage:
  tabbit status
  tabbit launch
  tabbit tabs
  tabbit tabs new <url>
  tabbit tabs activate <id>
  tabbit tabs close <id>
  tabbit sidebar new-tab [url]
  tabbit page inspect [tabId]
  tabbit page eval <js>
  tabbit chat open
  tabbit chat send <prompt>
  tabbit chat wait [timeoutMs]
  tabbit chat last
  tabbit chat result
  tabbit chat confirm-execute
  tabbit chat run <prompt>
  tabbit agent status
  tabbit task create <name>
  tabbit task list
  tabbit task status <id>
  tabbit task update <id> <status> [note]
  tabbit downloads dir
  tabbit downloads list
  tabbit downloads wait [timeoutMs]
  tabbit downloads parse <path>
`);
}

async function main(): Promise<void> {
  const bridge = new TabbitBridge();
  const [group, command, ...args] = process.argv.slice(2);

  if (!group || group === "help" || group === "--help" || group === "-h") {
    usage();
    return;
  }

  if (group === "status") {
    print(await bridge.status());
    return;
  }

  if (group === "launch") {
    print(await bridge.ensureDebugging());
    return;
  }

  if (group === "tabs") {
    if (!command) {
      print(await bridge.cdp.listTabs());
      return;
    }
    if (command === "new") {
      print(await bridge.cdp.openTab(required(args[0], "url")));
      return;
    }
    if (command === "activate") {
      print(await bridge.cdp.activateTab(required(args[0], "id")));
      return;
    }
    if (command === "close") {
      print(await bridge.cdp.closeTab(required(args[0], "id")));
      return;
    }
  }

  if (group === "sidebar") {
    if (command === "new-tab") {
      print(await bridge.cdp.openTab(args[0] ?? "https://web.tabbit-ai.com/newtab"));
      return;
    }
  }

  if (group === "page") {
    if (command === "inspect") {
      print(await bridge.cdp.inspectPage(args[0]));
      return;
    }
    if (command === "eval") {
      print(await bridge.cdp.evaluate(required(args.join(" "), "js")));
      return;
    }
  }

  if (group === "chat") {
    if (command === "open") {
      print(await bridge.chat.open());
      return;
    }
    if (command === "send") {
      const prompt = required(args.join(" "), "prompt");
      print(await bridge.chat.send(prompt));
      return;
    }
    if (command === "wait") {
      print(await bridge.chat.waitResult({ timeoutMs: args[0] ? Number(args[0]) : undefined }));
      return;
    }
    if (command === "last") {
      print(await bridge.chat.readVisible());
      return;
    }
    if (command === "result") {
      print(await bridge.chat.readLastResult());
      return;
    }
    if (command === "confirm-execute") {
      print(await bridge.chat.confirmExecute());
      return;
    }
    if (command === "run") {
      const prompt = required(args.join(" "), "prompt");
      print(await bridge.chat.runTask(prompt));
      return;
    }
  }

  if (group === "agent") {
    if (command === "status") {
      print(await bridge.chat.runtimeStatus());
      return;
    }
  }

  if (group === "task") {
    if (command === "create") {
      print(bridge.state.createTask(required(args.join(" "), "name")));
      return;
    }
    if (command === "list") {
      print(bridge.state.listTasks());
      return;
    }
    if (command === "status") {
      print(bridge.state.getTask(required(args[0], "id")));
      return;
    }
    if (command === "update") {
      const [id, status, ...noteParts] = args;
      print(bridge.state.setTaskStatus(required(id, "id"), required(status, "status") as never, noteParts.join(" ") || undefined));
      return;
    }
  }

  if (group === "downloads") {
    if (command === "dir") {
      print(bridge.downloads.getDirectory());
      return;
    }
    if (command === "list") {
      print(bridge.downloads.list());
      return;
    }
    if (command === "wait") {
      print(await bridge.downloads.waitForNew({ timeoutMs: args[0] ? Number(args[0]) : undefined }));
      return;
    }
    if (command === "parse") {
      print(await bridge.downloads.parseAndRecord(required(args[0], "path")));
      return;
    }
  }

  usage();
  process.exitCode = 1;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
