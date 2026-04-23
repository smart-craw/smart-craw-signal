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
  const mcpSection = mcpCodeUrl
    ? {
        mcpServers: {
          "code-mcp": {
            type: "sse" as const,
            url: mcpCodeUrl,
          },
        },
        allowedTools: ["mcp__claude-mcp__*"],
      }
    : {};
  const q = query({
    prompt: mq,
    options: {
      cwd: workingDirectory,
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
  return q;
}
