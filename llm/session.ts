import {
  listSessions,
  type PermissionResult,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { MessageQueue } from "./mq.ts";
import { randomUUID } from "node:crypto";
import { logger } from "../logging.ts";
import { instructLlm } from "./converse.ts";

export class SessionManagement {
  private mq: MessageQueue;
  private query: Query | undefined;
  private aq: Map<
    string, //sessionId
    (approved: boolean) => void
  >;
  private currentSessionId: string;
  private isNew: boolean;
  private hasLoaded: boolean = false;
  constructor() {
    this.mq = new MessageQueue();
    this.isNew = true;
    this.currentSessionId = randomUUID(); //possibly temporary, can be replaced by loadSessions
    this.aq = new Map<
      string, //sessionId
      (approved: boolean) => void
    >();
  }
  queueMessage(message: string) {
    this.mq.enqueue(message);
  }
  getApprovalResolver() {
    return this.aq.get(this.currentSessionId);
  }
  setApprovalResolver() {
    return new Promise<boolean>((resolve) => {
      console.log("inside set approval resolver");
      console.log(this.aq);
      this.aq.set(this.currentSessionId, resolve);
    });
    //return this.aq.set(this.currentSessionId, resolve);
  }
  removeApprovalResolver() {
    this.aq.delete(this.currentSessionId);
  }
  getSessionId() {
    return this.currentSessionId;
  }
  setSessionId(sessionId: string) {
    this.isNew = false;
    this.currentSessionId = sessionId;
    return this.currentSessionId;
  }
  newSession() {
    this.isNew = true;
    this.currentSessionId = randomUUID();
    return this.currentSessionId;
  }
  async startSession(
    approvalCb: (toolName: string, input: any) => Promise<PermissionResult>,
    workingDirectory?: string,
    mcpCodeUrl?: string,
  ) {
    if (!this.hasLoaded) {
      logger.warn("Cannot start session until after `loadSessions` is called");
      return;
    }
    if (this.query !== undefined) {
      await this.query.interrupt();
      this.query.close();
    }
    this.query = instructLlm(
      this.isNew,
      this.currentSessionId, //if doesn't already exist, creates a new session.
      approvalCb,
      this.mq,
      workingDirectory,
      mcpCodeUrl,
    );
    return this.query;
  }
  async getSessions() {
    return (await listSessions()).map(({ sessionId, summary }) => ({
      sessionId,
      summary,
    }));
  }
  /*getQuery() {
    return this.query;
    }*/
  async loadSessions() {
    const sessions = await listSessions();
    //sort in order from most recently modified to last modified
    sessions.sort((a, b) => b.lastModified - a.lastModified);
    logger.info(`Sessions: ${JSON.stringify(sessions, null, 2)}`);
    if (sessions.length > 0) {
      this.currentSessionId = sessions[0].sessionId;
      this.isNew = false;
    }
    this.hasLoaded = true;
  }
}
