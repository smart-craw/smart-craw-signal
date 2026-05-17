import path from "node:path";
import { chdir, cwd } from "node:process";
import { readdir, readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { logger } from "../logging.ts";
import { createAgent } from "./converse.ts";
import { Agent } from "@strands-agents/sdk";
import { handleLLMResponse } from "./response.ts";

export type SessionManager = ReturnType<typeof createSessionManager>;

export const createSessionManager = (
  llmUrl: string,
  sessionStorageLocation: string,
  onComplete: (fullMessage: string, isError: boolean) => void,
  //approvalCb: (toolName: string, input: any) => Promise<PermissionResult>,
  workingDirectory?: string,
  mcpCodeUrl?: string,
  agentId?: string,
) => {
  let agent: Agent | undefined;
  const localAgentId = agentId || "agent";
  const aq = new Map<string, (approved: boolean) => void>();
  let currentSessionId: string = randomUUID();
  if (workingDirectory) {
    //tools adopt the process.cwd()
    if (path.isAbsolute(workingDirectory)) {
      chdir(workingDirectory);
    } else {
      chdir(path.join(cwd(), workingDirectory));
    }
  }
  const queueMessage = (message: string) => {
    if (agent) {
      handleLLMResponse(agent.stream(message), onComplete);
    }
  };

  const getApprovalResolver = () => {
    return aq.get(currentSessionId);
  };

  const setApprovalResolver = () => {
    return new Promise<boolean>((resolve) => {
      aq.set(currentSessionId, resolve);
    });
  };

  const removeApprovalResolver = () => {
    aq.delete(currentSessionId);
  };

  const getSessionId = () => {
    return currentSessionId;
  };

  const setSessionId = (sessionId: string) => {
    currentSessionId = sessionId;
    startSession(sessionId);
    return currentSessionId;
  };

  const newSession = () => {
    currentSessionId = randomUUID();
    startSession(currentSessionId);
    return currentSessionId;
  };

  const startSession = (sessionId: string) => {
    if (agent !== undefined) {
      agent.cancel();
    }
    agent = createAgent(
      llmUrl,
      sessionId,
      sessionStorageLocation,
      localAgentId,
      mcpCodeUrl,
    );
    return agent;
  };

  // this ONLY gets from filesystem.  If you create a new session
  // and IMMEDIATELY list all sessions, the newest won't be displayed
  const getSessions = async () => {
    const files = await readdir(sessionStorageLocation);
    const fileStats = await Promise.all(
      files.map((v) =>
        Promise.all([v, stat(path.join(sessionStorageLocation, v))]),
      ),
    );
    return Promise.all(
      fileStats
        .filter(([_, v]) => v.isDirectory())
        .map(async ([folderName]) => {
          const latestSessionInfo = path.join(
            sessionStorageLocation,
            folderName,
            "scopes",
            "agent",
            localAgentId,
            "snapshots",
            "snapshot_latest.json",
          );
          const { createdAt, data } = JSON.parse(
            await readFile(latestSessionInfo, "utf-8"),
          );

          return {
            createdAt,
            summary: data.messages[0].content[0]["text"],
            sessionId: folderName,
          };
        }),
    );
  };

  const loadLastSessionOrCreateInitial = async () => {
    const sessions = await getSessions();
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    logger.debug(`Sessions: ${JSON.stringify(sessions, null, 2)}`);
    if (sessions.length > 0) {
      currentSessionId = sessions[0].sessionId;
    }
    startSession(currentSessionId);
  };

  return {
    queueMessage,
    getApprovalResolver,
    setApprovalResolver,
    removeApprovalResolver,
    getSessionId,
    setSessionId,
    newSession,
    //startSession,
    getSessions,
    loadLastSessionOrCreateInitial,
  };
};
