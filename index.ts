import { SignalBot } from "signal-sdk";
import "dotenv/config";
import { MessageQueue } from "./llm/mq.ts";
import { randomUUID } from "node:crypto";
import { approvalWrapper, instructLlm } from "./llm/converse.ts";
import { handleLLMResponse, parseMessage } from "./llm/response.ts";
import { logger } from "./logging.ts";

const mq = new MessageQueue();
const aq = new Map<string, (approved: boolean) => void>();
//is this the right way to handle sessions?
const sessionId = randomUUID();
const startThink = process.env.START_THINK_TOKEN || "<think>";
const endThink = process.env.END_THINK_TOKEN || "</think>";
const adminNumber = `+1${process.env.SIGNAL_USER_ADMIN_NUMBER}`;
const commandPrefix = "/";
const bot = new SignalBot({
  phoneNumber: `+1${process.env.SIGNAL_BOT_PHONE_NUMBER}`,
  admins: [adminNumber],
  settings: {
    commandPrefix,
    logMessages: true,
  },
});

// Register a command (eg, if user sends /hello world)
bot.addCommand({
  name: "hello",
  description: "Greet the user",
  handler: async (message, args) => {
    const name = args.join(" ") || "friend";
    return `Hello, ${name}!`;
  },
});

const approveCommand = "approve";
const denyCommand = "deny";
bot.addCommand({
  name: approveCommand,
  description: "Approve tool use",
  adminOnly: true,
  handler: async (message, args) => {
    const resolve = aq.get(sessionId);
    if (resolve) {
      resolve(true); //approved
      aq.delete(sessionId);
    } else {
      logger.warn(`No pending approval found for bot id: ${sessionId}`);
    }
    return `Approval submitted!`;
  },
});
bot.addCommand({
  name: denyCommand,
  description: "Deny tool use",
  adminOnly: true,
  handler: async (message, args) => {
    const resolve = aq.get(sessionId);
    if (resolve) {
      resolve(false); //denied
      aq.delete(sessionId);
    } else {
      logger.warn(`No pending approval found for bot id: ${sessionId}`);
    }
    return `Denial submitted!`;
  },
});

// Listen for any message
bot.on("message", (msg) => {
  if (msg.source !== adminNumber) {
    console.error(`Unrecognized number ${msg.source}`);
    return;
  }
  mq.enqueue(msg.text);
  logger.info(`Message from ${msg.source}: ${msg.text}`);
});
const sendMessage = (toolName: string, parameters: string) =>
  bot.sendMessage(
    adminNumber,
    `Approval requested for tool "${toolName}". \n\nParameters: \n${parameters}\n.\n\nText "${commandPrefix}${approveCommand}" to approve or "${commandPrefix}${denyCommand}" to deny.`,
  );
const onComplete = (fullMessage: string, isError: boolean) => {
  if (isError) {
    bot.sendMessage(
      adminNumber,
      `Bot didn't complete successfully! ${fullMessage}`,
    );
  } else {
    const { reasoning, message } = parseMessage(
      startThink,
      endThink,
      fullMessage,
    );
    bot.sendMessage(adminNumber, message);
    logger.info(`Reasoning: ${reasoning}, Message: ${message}`);
  }
};
bot.on("ready", () => {
  logger.info("Bot is running!");
  const query = instructLlm(
    sessionId,
    approvalWrapper(sessionId, aq, sendMessage),
    mq,
  );
  handleLLMResponse(query, onComplete);
});

await bot.start();
