import {
  Agent,
  FileStorage,
  McpClient,
  type McpTransport,
  SessionManager,
  SummarizingConversationManager,
  BeforeInvocationEvent,
  BeforeToolCallEvent,
  BeforeModelCallEvent,
  tool,
} from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { logger } from "../logging.ts";
import { getSystemPrompt } from "./prompt.ts";

import { bash } from "@strands-agents/sdk/vended-tools/bash";
import { fileEditor } from "@strands-agents/sdk/vended-tools/file-editor";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const dateTimeTool = tool({
  name: "current_datetime",
  description:
    "Returns the current date and time in UTC.  Use this tool every time you are prompted for date or time.  Do not use previous responses or context.",
  callback: () => {
    return new Date().toISOString();
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function extractMcpTools(mcpClient: McpClient | undefined) {
  if (mcpClient === undefined) {
    return [];
  } else {
    return mcpClient.listTools();
  }
}

function generateNoRuntimeInstructions(tools: string[]) {
  const toolNameHint =
    tools.length > 0 ? `Use one of ${tools.join(", ")} - ` : "";
  return toolNameHint + "Do not invoke language runtimes directly via bash.";
}

export async function createAgent(
  llmUrl: string,
  sessionId: string,
  sessionDirectory: string, //where agent should store its files
  sessionStorageLocation: string, //equivalent to ~/.claude in claude code
  agentId: string,
  mcpCodeUrl?: string,
) {
  const model = new OpenAIModel({
    api: "chat",
    apiKey: "helloworld",
    contextWindowLimit: 256_000, //needed to get proactive compaction working correctly
    clientConfig: {
      baseURL: llmUrl,
    },
  });

  const mcpCodeClient = mcpCodeUrl
    ? new McpClient({
        transport: new StreamableHTTPClientTransport(
          new URL(mcpCodeUrl),
        ) as McpTransport,
      })
    : undefined;

  const mcpTools = await extractMcpTools(mcpCodeClient);
  const mcpToolNames = mcpTools.map((v) => v.name);
  const bashInstructions = generateNoRuntimeInstructions(mcpToolNames);

  const session = new SessionManager({
    sessionId,
    storage: { snapshot: new FileStorage(sessionStorageLocation) },
  });
  const tools = [bash, fileEditor, dateTimeTool, ...mcpTools];

  // Create an agent with tools
  const agent = new Agent({
    systemPrompt: getSystemPrompt(sessionDirectory),
    sessionManager: session,
    model,
    printer: false,
    tools,
    id: agentId,
    conversationManager: new SummarizingConversationManager({
      summaryRatio: 0.5,
      preserveRecentMessages: 10,
      proactiveCompression: true, //compress before hitting context limit error
    }),
  });
  agent.addHook(BeforeInvocationEvent, (event) => {
    logger.debug(JSON.stringify(event, null, 2));
  });

  agent.addHook(BeforeModelCallEvent, (event) => {
    logger.info(JSON.stringify(event, null, 2));
  });
  agent.addHook(BeforeToolCallEvent, (event) => {
    if (event.toolUse.name === "bash" && isRecord(event.toolUse.input)) {
      const { command } = event.toolUse.input;
      if (
        typeof command === "string" &&
        /\b(node|npm|yarn|python3?|pip3?|cargo|rustc)\b/.test(command)
      ) {
        event.cancel = bashInstructions;
      }
    }
    logger.info(JSON.stringify(event, null, 2));
  });
  return agent;
}
