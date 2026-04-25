import {
  type Query,
  type HookInput,
  type PermissionResult,
  type SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../logging.ts";

const hookLogs = async (input: HookInput) => {
  logger.debug(
    `Hook called: ${input.hook_event_name}.  Message: ${JSON.stringify(input, null, 2)}`,
  );
  return {};
};

export const approvalWrapper = (
  id: string,
  pendingApprovals: Map<string, (approved: boolean) => void>,
  sendMessage: (toolName: string, parameters: string) => void,
) => {
  return async function customApprovalCallback(
    toolName: string,
    input: any,
  ): Promise<PermissionResult> {
    logger.debug("Approval called");
    sendMessage(toolName, JSON.stringify(input, null, 2));
    const isApproved = await new Promise<boolean>((resolve) => {
      pendingApprovals.set(id, resolve);
    });
    logger.debug("Approval decision made", isApproved);
    return isApproved
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Tool use denied" };
  };
};

export function instructLlm(
  id: string,
  approvalCb: (toolName: string, input: any) => Promise<PermissionResult>,
  mq: AsyncIterable<SDKUserMessage>,
  workingDirectory?: string,
  mcpCodeUrl?: string,
): Query {
  const codeMcpName = "code-mcp";
  const mcpSection = mcpCodeUrl
    ? {
        mcpServers: {
          [codeMcpName]: {
            type: "http" as const,
            url: mcpCodeUrl,
            headers: {
              Accept: "application/json, text/event-stream",
            },
          },
        },
        allowedTools: [`mcp__${codeMcpName}__*`],
      }
    : {};
  const appendSystemPrompt = mcpCodeUrl
    ? {
        append: `Use the ${codeMcpName} tool for any Javascript, Python, or Rust programming`,
      }
    : {};
  const q = query({
    prompt: mq,
    options: {
      cwd: workingDirectory,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        ...appendSystemPrompt,
      },

      tools: { type: "preset", preset: "claude_code" },
      ...mcpSection,
      canUseTool: approvalCb,
      sessionId: id,
      hooks: {
        Notification: [{ hooks: [hookLogs] }],
        PostToolUseFailure: [
          {
            hooks: [hookLogs],
          },
        ],
        PermissionRequest: [
          {
            hooks: [hookLogs],
          },
        ],
      },
      includePartialMessages: true,
      model: process.env.MODEL || "hf.co/Qwen/Qwen3-4B-GGUF:latest",
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL:
          process.env.ANTHROPIC_BASE_URL || "http://localhost:11434",
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || "ollama",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "sk-local-dummy",
        CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
      },
    },
  });
  q.initializationResult().then((result) => {
    logger.info(`Init result: ${JSON.stringify(result, null, 2)}`);
  });
  if (mcpCodeUrl) {
    q.mcpServerStatus().then((status) => {
      logger.info(`MCP status: ${JSON.stringify(status, null, 2)}`);
    });
  }

  return q;
}
