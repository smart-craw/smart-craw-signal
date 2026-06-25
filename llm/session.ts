import path from "node:path";
import { chdir, cwd } from "node:process";
import { readdir, readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { logger } from "../logging.ts";
import { createAgent } from "./converse.ts";
import { Agent } from "@strands-agents/sdk";
import { mkdir } from "node:fs/promises";
import { handleLLMResponse } from "./response.ts";

export type SessionManager = ReturnType<typeof createSessionManager>;

export const createSessionManager = (
  llmUrl: string,
  sessionStorageLocation: string,
  onComplete: (fullMessage: string, isError: boolean) => void,
  workingDirectory: string,
  mcpCodeUrl?: string,
  agentId?: string,
) => {
  let agent: Agent | undefined;
  const localAgentId = agentId || "agent";
  let currentSessionId: string = randomUUID();
  const queue: string[] = [];
  let running = false;

  const absoluteWorkingDirectory = path.isAbsolute(workingDirectory)
    ? workingDirectory
    : path.join(cwd(), workingDirectory);
  //tools adopt the process.cwd()
  logger.info(`Working directory is ${absoluteWorkingDirectory}`);
  chdir(absoluteWorkingDirectory);

  // while in theory no messages will arrive while
  // previous response is still running, this ensures that
  // if they do that they wait until the llm is ready
  // before executing
  const queueMessage = (message: string) => {
    queue.push(message);
    if (!running) {
      drain();
    }
  };

  const drain = async () => {
    if (agent) {
      running = true;
      // careful, queue can be mutated via queueMessage while this loop is running
      // this is intentional, but worth noting
      while (queue.length > 0) {
        const msg = queue.shift()!;
        await handleLLMResponse(agent.stream(msg), onComplete);
      }
      running = false;
    }
  };
  const getSessionId = () => {
    return currentSessionId;
  };

  const setSessionId = async (sessionId: string) => {
    currentSessionId = sessionId;
    await startSession(sessionId);
    return currentSessionId;
  };

  const newSession = async () => {
    currentSessionId = randomUUID();
    await startSession(currentSessionId);
    return currentSessionId;
  };

  const cancelMessage = () => {
    if (agent !== undefined) {
      agent.cancel();
    }
  };

  const startSession = async (sessionId: string) => {
    const sessionDirectory = path.join(absoluteWorkingDirectory, sessionId);
    //does not error if directory already exists
    await mkdir(sessionDirectory, { recursive: true });
    cancelMessage();
    agent = await createAgent(
      llmUrl,
      sessionId,
      sessionDirectory,
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
    const sessions = await Promise.all(
      fileStats
        .filter(([_, v]) => v.isDirectory())
        .map(async ([folderName]) => {
          //see https://strandsagents.com/docs/user-guide/concepts/agents/session-management/#file-storage-structure
          const latestSessionInfo = path.join(
            sessionStorageLocation,
            folderName,
            "scopes",
            "agent",
            localAgentId,
            "snapshots",
            "snapshot_latest.json",
          );
          try {
            const { createdAt, data } = JSON.parse(
              await readFile(latestSessionInfo, "utf-8"),
            );

            return {
              createdAt,
              summary: data.messages[0].content[0]["text"],
              sessionId: folderName,
            };
          } catch (err) {
            const error = err as Error;
            logger.error(`Error! ${error.name}: ${error.message}`);
            return null;
          }
        }),
    );
    return sessions.filter((v) => v !== null);
  };

  const loadLastSessionOrCreateInitial = async () => {
    const sessions = await getSessions();
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    logger.debug(`Sessions: ${JSON.stringify(sessions, null, 2)}`);
    if (sessions.length > 0) {
      currentSessionId = sessions[0].sessionId;
    }
    await startSession(currentSessionId);
  };

  return {
    queueMessage,
    getSessionId,
    setSessionId,
    newSession,
    getSessions,
    cancelMessage,
    loadLastSessionOrCreateInitial,
  };
};
