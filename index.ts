import { SignalBot } from "./signal/bot.ts";
import "dotenv/config";
import { MessageQueue } from "./llm/mq.ts";
import { approvalWrapper, instructLlm } from "./llm/converse.ts";
import { handleLLMResponse, parseMessage } from "./llm/response.ts";
import { logger } from "./logging.ts";
import { SessionManagement } from "./llm/session.ts";

const startThink = process.env.START_THINK_TOKEN || "<think>";
const endThink = process.env.END_THINK_TOKEN || "</think>";
const adminNumber = `+1${process.env.SIGNAL_USER_ADMIN_NUMBER}`;
const workingDirectory = process.env.AGENT_CWD;
const signalUrl = process.env.SIGNAL_REST_ENDPOINT || "http://localhost:9001";
const codeMcpEndpoint = process.env.MCP_CODE_SERVER_ENDPOINT;
const commandPrefix = "/";

logger.info(`Start think token: ${startThink}, End think Token ${endThink}`);
logger.info(`API endpoint: ${process.env.ANTHROPIC_BASE_URL}`);
logger.info(`Code MCP endpoint: ${codeMcpEndpoint}`);
logger.info(`Working directory: ${workingDirectory}`);

const sessionManager = new SessionManagement();

const bot = new SignalBot({
  phoneNumber: `+1${process.env.SIGNAL_BOT_PHONE_NUMBER}`,
  recipientNumber: adminNumber,
  url: signalUrl,
  settings: {
    commandPrefix,
  },
});
const helpCommand = "help";
const approveCommand = "approve";
const denyCommand = "deny";
const newSessionCommand = "new_session";
const selectSessionCommand = "select_session";
const listSessionsCommand = "list_sessions";
const activeSessionCommand = "current_session";

bot.addCommand({
  name: helpCommand,
  description: "Get lists of commands",
  adminOnly: true,
  handler: async () => {
    return bot
      .getCommands()
      .reduce<string>(
        (aggr, { name, description }) =>
          aggr + `\n${commandPrefix}${name}: ${description}`,
        "Commands:\n",
      );
  },
});

// Register a command "approve".
bot.addCommand({
  name: approveCommand,
  description: "Approve tool use",
  adminOnly: true,
  handler: async () => {
    const resolve = sessionManager.getApprovalResolver(); //aq.get(approvalId);
    if (resolve) {
      resolve(true); //approved
      sessionManager.removeApprovalResolver();
    } else {
      logger.warn(`No pending approval found!`);
    }
    return `Approval submitted!`;
  },
});

// Register a command "deny".
bot.addCommand({
  name: denyCommand,
  description: "Deny tool use",
  adminOnly: true,
  handler: async () => {
    const resolve = sessionManager.getApprovalResolver(); //aq.get(approvalId);
    if (resolve) {
      resolve(false); //denied
      sessionManager.removeApprovalResolver();
    } else {
      logger.warn(`No pending approval found!`);
    }
    return `Denial submitted!`;
  },
});
const setQuery = async () => {
  const query = await sessionManager.startSession(
    approvalWrapper(() => sessionManager.setApprovalResolver(), sendMessage),
    workingDirectory,
    codeMcpEndpoint,
  );
  if (query) {
    handleLLMResponse(query, onComplete);
  } else {
    logger.warn("Query created with start session but it is undefined!");
  }
};

// Register a command "newsession".
bot.addCommand({
  name: newSessionCommand,
  description: "Create new session",
  adminOnly: true,
  handler: async () => {
    const sessionId = sessionManager.newSession();
    await setQuery();
    return `New session created: ${sessionId}`;
  },
});

bot.addCommand({
  name: listSessionsCommand,
  description: "List sessions",
  adminOnly: true,
  handler: async () => {
    const sessions = await sessionManager.getSessions();
    const sessionsMessage = sessions.reduce(
      (aggr, curr, index) =>
        aggr +
        `\nIndex: ${index}\nSession ID: ${curr.sessionId}\nSummary: ${curr.summary}\n------------`,
      "",
    );
    return (
      sessionsMessage +
      `\n\nTo select a session use \`${commandPrefix}${selectSessionCommand} {index}\`.`
    );
  },
});

bot.addCommand({
  name: activeSessionCommand,
  description: "Get current session id",
  adminOnly: true,
  handler: async () => {
    const sessionId = sessionManager.getSessionId();
    return `Session ID: ${sessionId}`;
  },
});

bot.addCommand({
  name: selectSessionCommand,
  description: "Select session",
  adminOnly: true,
  handler: async (sessionIndex: string) => {
    const sessions = await sessionManager.getSessions();
    try {
      const index = parseInt(sessionIndex);
      const { sessionId } = sessions[index];
      sessionManager.setSessionId(sessionId);
      await setQuery();
      return `New session set: ${sessionId}`;
    } catch (err) {
      const error = err as Error;
      const msg = `Error! ${error.name}: ${error.message}`;
      logger.error(msg);
      return msg;
    }
  },
});

// Listen for any message, but ONLY respond to admin number
bot.on("message", (msg) => {
  const sender = msg.source;
  if (sender !== adminNumber) {
    console.error(`Unrecognized number ${sender}`);
    return;
  }
  sessionManager.queueMessage(msg.message);
  logger.info(`Message from ${sender}: ${msg.message}`);
});
const sendMessage = (toolName: string, parameters: string) =>
  bot.sendMessage(
    `Approval requested for tool "${toolName}". \n\nParameters: \n${parameters}\n.\n\nText "${commandPrefix}${approveCommand}" to approve or "${commandPrefix}${denyCommand}" to deny.`,
  );
const onComplete = (fullMessage: string, isError: boolean) => {
  if (isError) {
    bot.sendMessage(`Bot didn't complete successfully! ${fullMessage}`);
  } else {
    const { reasoning, message } = parseMessage(
      startThink,
      endThink,
      fullMessage,
    );
    bot.sendMessage(message);
    logger.info(`Reasoning: ${reasoning}, Message: ${message}`);
  }
};

bot.on("ready", async () => {
  logger.info("Bot is running!");
  await setQuery();
});
await sessionManager.loadSessions();
await bot.start(commandPrefix);

process.on("SIGINT", () => {
  bot.close();
});
