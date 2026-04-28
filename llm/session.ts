import {
  listSessions,
  type PermissionResult,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { MessageQueue } from "./mq.ts";
import { randomUUID } from "node:crypto";
import { logger } from "../logging.ts";
import { instructLlm } from "./converse.ts";

export type SessionManager = ReturnType<typeof createSessionManager>;

export const createSessionManager = () => {
  let mq = new MessageQueue();
  let query: Query | undefined;
  const aq = new Map<string, (approved: boolean) => void>();
  let currentSessionId: string = randomUUID();
  let isNew = true;
  let hasLoaded = false;

  const queueMessage = (message: string) => {
    mq.enqueue(message);
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
    isNew = false;
    currentSessionId = sessionId;
    return currentSessionId;
  };

  const newSession = () => {
    isNew = true;
    currentSessionId = randomUUID();
    return currentSessionId;
  };

  const startSession = async (
    approvalCb: (toolName: string, input: any) => Promise<PermissionResult>,
    workingDirectory?: string,
    mcpCodeUrl?: string,
  ) => {
    if (!hasLoaded) {
      logger.warn("Cannot start session until after `loadSessions` is called");
      return;
    }
    if (query !== undefined) {
      await query.interrupt();
      query.close();
      mq.close();
      mq = new MessageQueue();
    }
    query = instructLlm(
      isNew,
      currentSessionId,
      approvalCb,
      mq,
      workingDirectory,
      mcpCodeUrl,
    );
    return query;
  };

  const getSessions = async () => {
    return (await listSessions()).map(({ sessionId, summary }) => ({
      sessionId,
      summary,
    }));
  };

  const loadSessions = async () => {
    const sessions = await listSessions();
    sessions.sort((a, b) => b.lastModified - a.lastModified);
    logger.debug(`Sessions: ${JSON.stringify(sessions, null, 2)}`);
    if (sessions.length > 0) {
      currentSessionId = sessions[0].sessionId;
      isNew = false;
    }
    hasLoaded = true;
  };

  return {
    queueMessage,
    getApprovalResolver,
    setApprovalResolver,
    removeApprovalResolver,
    getSessionId,
    setSessionId,
    newSession,
    startSession,
    getSessions,
    loadSessions,
  };
};
