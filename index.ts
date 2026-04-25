import { SignalBot } from "./signal/bot.ts";
import "dotenv/config";
import { MessageQueue } from "./llm/mq.ts";
import { approvalWrapper, instructLlm } from "./llm/converse.ts";
import { handleLLMResponse, parseMessage } from "./llm/response.ts";
import { logger } from "./logging.ts";

const mq = new MessageQueue();
const aq = new Map<string, (approved: boolean) => void>();
// doesn't matter what approvalId is, just needs to be a
// "key" to look up pending approval
const approvalId = "signalsession";
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

const bot = new SignalBot({
  phoneNumber: `+1${process.env.SIGNAL_BOT_PHONE_NUMBER}`,
  recipientNumber: adminNumber,
  url: signalUrl,
  settings: {
    commandPrefix,
  },
});

const approveCommand = "approve";
const denyCommand = "deny";

// Register a command "approve".
bot.addCommand({
  name: approveCommand,
  description: "Approve tool use",
  adminOnly: true,
  handler: async () => {
    const resolve = aq.get(approvalId);
    if (resolve) {
      resolve(true); //approved
      aq.delete(approvalId);
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
    const resolve = aq.get(approvalId);
    if (resolve) {
      resolve(false); //denied
      aq.delete(approvalId);
    } else {
      logger.warn(`No pending approval found!`);
    }
    return `Denial submitted!`;
  },
});

// Listen for any message, but ONLY respond to admin number
bot.on("message", (msg) => {
  const sender = msg.source;
  if (sender !== adminNumber) {
    console.error(`Unrecognized number ${sender}`);
    return;
  }
  mq.enqueue(msg.message);
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
bot.on("ready", () => {
  logger.info("Bot is running!");
  const query = instructLlm(
    approvalWrapper(approvalId, aq, sendMessage),
    mq,
    workingDirectory,
    codeMcpEndpoint,
  );
  handleLLMResponse(query, onComplete);
});

await bot.start();

process.on("SIGINT", () => {
  bot.close();
});
