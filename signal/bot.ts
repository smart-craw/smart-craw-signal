import { EventEmitter } from "node:events";
import { SignalClient } from "signal-rest-ts";
import { logger } from "../logging.ts";

interface Envelope {
  source: string;
}
export interface RawMessage {
  envelope: Envelope;
}
//why can't I import this from signal-rest-ts :\
export interface MessageContext {
  message: string;
  sourceUuid: string;
  rawMessage: RawMessage;
  account: string;
  replyTo: string;
  client?: SignalClient;
  reply: (message: string, attachments?: string[]) => Promise<void>;
  react: (emoji: string) => Promise<void>;
}
type Settings = {
  commandPrefix: string;
};
type Config = {
  phoneNumber: string;
  recipientNumber: string;
  settings: Settings;
  url: string;
};
type Command = {
  name: string;
  description: string;
  adminOnly: boolean;
  handler: (...v: string[]) => Promise<string>;
};
type PartialConfig = Pick<
  Config,
  "phoneNumber" | "recipientNumber" | "settings"
>;
export class SignalBot extends EventEmitter {
  private signal: SignalClient;
  private config: PartialConfig;
  private commands: Command[] = [];
  private hasStarted: boolean = false;
  constructor(config: Config) {
    super();
    const { url, ...rest } = config;
    logger.debug(`Config: ${JSON.stringify(config, null, 2)}`);
    this.config = rest;
    this.signal = new SignalClient(url);
  }
  close() {
    this.signal.receive().stopAllReceiving();
  }
  getCommands() {
    return this.commands;
  }
  private register() {
    this.signal.receive().registerHandler(
      this.config.phoneNumber,
      /.*/, //catch everything
      async (context: MessageContext) => {
        const source = context.rawMessage.envelope.source;
        const { message } = context;
        if (message.startsWith(this.config.settings.commandPrefix)) {
          const [parsedCommand, ...rest] = message.substring(1).split(" ");
          const command = this.commands.find(
            ({ name }) => name === parsedCommand,
          );
          if (command) {
            if (!command.adminOnly || source === this.config.recipientNumber) {
              const result = await command.handler(...rest);
              await context.reply(result);
            } else {
              await context.reply(
                `Account ${source} is not allowed to execute command ${message}`,
              );
            }
          } else {
            await context.reply("Error: command not found");
          }
        } else {
          this.emit("message", { source, message });
        }
      },
    );
  }
  async start(commandPrefix: string) {
    this.register();
    this.signal.receive().startReceiving(this.config.phoneNumber);
    this.hasStarted = true;
    await this.sendMessage(
      `Signal Bot Started!\n\nBot is now active\nNumber: ${this.config.phoneNumber}\n\nTo view available commands, send "${commandPrefix}help".\n\nHappy chatting!`,
    );
    this.emit("ready");
  }
  addCommand(command: Command) {
    this.commands.push(command);
    if (this.hasStarted) {
      //if already started, need to recreate the handlers to accomodate the new command
      this.signal.receive().clearHandlers();
      this.register();
    }
  }
  async sendMessage(message: string) {
    await this.signal.message().sendMessage({
      number: this.config.phoneNumber,
      message,
      recipients: [this.config.recipientNumber],
    });
  }
}
