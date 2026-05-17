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
} from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { logger } from "../logging.ts";
import { generateMcpCodePromps, SYSTEM_PROMPT } from "./prompt.ts";

import { bash } from "@strands-agents/sdk/vended-tools/bash";
import { fileEditor } from "@strands-agents/sdk/vended-tools/file-editor";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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
      baseURL: llmUrl, //process.env.ANTHROPIC_BASE_URL || "http://localhost:11434",
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

  const tools = [bash, fileEditor, ...(mcpCodeClient ? [mcpCodeClient] : [])];

  const appendSystemPrompt = mcpCodeUrl
    ? `\n${generateMcpCodePromps(mcpCodeUrl)}`
    : "";

  // Create an agent with tools
  const agent = new Agent({
    systemPrompt: SYSTEM_PROMPT + appendSystemPrompt,
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
    logger.info(JSON.stringify(event, null, 2));
  });

  agent.addHook(BeforeModelCallEvent, (event) => {
    logger.info(JSON.stringify(event, null, 2));
  });
  agent.addHook(BeforeToolCallEvent, (event) => {
    logger.info(JSON.stringify(event, null, 2));
  });
  return agent;
}
