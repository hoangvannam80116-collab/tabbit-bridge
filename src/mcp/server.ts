#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TabbitBridge } from "../core/bridge.js";
import { createTools } from "./tools.js";

const bridge = new TabbitBridge();
const toolDefinitions = createTools(bridge);
const tools = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

const server = new Server(
  {
    name: "tabbit-bridge",
    version: "0.1.3",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.get(request.params.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const result = await tool.run((request.params.arguments ?? {}) as Record<string, unknown>);
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
});

await server.connect(new StdioServerTransport());
