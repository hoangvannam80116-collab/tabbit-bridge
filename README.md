# tabbit-bridge

`tabbit-bridge` lets Codex use **Tabbit Browser as an execution agent**.

The intended workflow is:

```text
Codex = planner / brain / project controller
Tabbit = browser execution agent
```

Codex talks to `tabbit-bridge` through MCP tools. `tabbit-bridge` then controls Tabbit through Chrome DevTools Protocol, DOM evaluation, macOS Accessibility for the Tabbit Chat panel, and a download-file watcher.

## What It Does

- Connects to Tabbit Browser through CDP.
- Lists, opens, activates, and closes Tabbit tabs.
- Sends instructions to the right-side Tabbit Chat panel.
- Waits for and reads Tabbit Chat results.
- Reads the current page DOM without screenshots.
- Tracks Codex-managed tasks and progress.
- Watches Tabbit downloads and parses downloaded files into Codex-readable content.
- Provides both an MCP server and a CLI backed by the same core code.

## Install

```bash
npm install -g tabbit-bridge
```

For local development:

```bash
git clone https://github.com/hoangvannam80116-collab/tabbit-bridge.git
cd tabbit-bridge
npm install
npm run build
```

## Start Tabbit With CDP

Tabbit must expose a DevTools port for DOM and page control:

```bash
osascript -e 'quit app "Tabbit Browser"'

open -na "/Applications/Tabbit Browser.app" --args \
  --remote-debugging-port=9222 \
  --remote-allow-origins=*
```

Or let the bridge do this:

```bash
tabbit launch
```

`tabbit launch` will relaunch Tabbit so the `--remote-debugging-port` flag can take effect. Save any important in-progress browser work first.

Check status:

```bash
tabbit status
```

## CLI Usage

```bash
tabbit tabs
tabbit tabs new https://www.biji.com
tabbit page inspect
tabbit chat open
tabbit chat send "请总结当前页面，并列出三个产品卖点"
tabbit chat wait
tabbit task create "Get笔记官网调研"
tabbit task list
tabbit downloads list
tabbit downloads wait
tabbit downloads parse /Users/you/Downloads/report.xlsx
```

## MCP Usage

Run the MCP server:

```bash
tabbit-mcp
```

Example Codex MCP config:

```json
{
  "mcpServers": {
    "tabbit-bridge": {
      "command": "tabbit-mcp"
    }
  }
}
```

If running from a cloned repository:

```json
{
  "mcpServers": {
    "tabbit-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/tabbit-bridge/dist/mcp/server.js"]
    }
  }
}
```

## MCP Tools

Connection:

- `tabbit.status`
- `tabbit.launch`

Tabs:

- `tabbit.tabs.list`
- `tabbit.tabs.new`
- `tabbit.tabs.activate`
- `tabbit.tabs.close`

Page inspection:

- `tabbit.page.inspect`
- `tabbit.page.eval`

Right-side Tabbit Chat:

- `tabbit.chat.open`
- `tabbit.chat.send`
- `tabbit.chat.wait_result`
- `tabbit.chat.read_last`
- `tabbit.chat.read_last_result`

Task state:

- `tabbit.task.create`
- `tabbit.task.list`
- `tabbit.task.status`
- `tabbit.task.update`

Downloads:

- `tabbit.downloads.get_directory`
- `tabbit.downloads.list`
- `tabbit.downloads.wait`
- `tabbit.downloads.parse`

## Design Notes

The primary control path is code-based, not screenshot-based:

1. CDP for tabs, DOM, page state, and JavaScript execution.
2. Tabbit Chat control through DOM when available.
3. macOS Accessibility for the Tabbit browser shell and right-side Chat panel when it is not exposed in page DOM.
4. File-system watcher and parsers for downloaded files.

Downloaded files are made readable to Codex by returning absolute paths plus parsed previews for:

- text, Markdown, CSV, JSON, HTML
- Excel `.xlsx` / `.xls`
- Word `.docx`
- PDF `.pdf`

## Current Limitations

- Tabbit Chat is a browser-shell UI in some builds, so `tabbit.chat.send` may require macOS Accessibility permission.
- The first version uses generic Chat input detection. Real-world Tabbit builds may need app-specific Accessibility selectors.
- CDP only controls the web contents area. Browser chrome and Tabbit side panels use Accessibility fallback.

## License

MIT
