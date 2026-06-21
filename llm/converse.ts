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
import { SYSTEM_PROMPT } from "./prompt.ts";

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

export function createAgent(
  llmUrl: string,
  sessionId: string,
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

  const mcpCodeClient =
    mcpCodeUrl &&
    new McpClient({
      transport: new StreamableHTTPClientTransport(
        new URL(mcpCodeUrl),
      ) as McpTransport,
    });

  const session = new SessionManager({
    sessionId,
    storage: { snapshot: new FileStorage(sessionStorageLocation) },
  });

  const tools = [
    bash,
    fileEditor,
    dateTimeTool,
    ...(mcpCodeClient ? [mcpCodeClient] : []),
  ];

  // Create an agent with tools
  const agent = new Agent({
    systemPrompt: SYSTEM_PROMPT,
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
    logger.info(JSON.stringify(event, null, 2));
  });
  return agent;
}
