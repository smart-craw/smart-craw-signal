///This mock exists to make it easier to develop.  Use this as a CLI tool to interact with the LLM
//

import { EventEmitter } from "node:events";
import { createInterface, type Interface } from "node:readline/promises";
import { logger } from "../logging.ts";

interface Envelope {
  source: string;
}
export interface RawMessage {
  envelope: Envelope;
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
  private config: PartialConfig;
  private commands: Command[] = [];
  private hasStarted: boolean = false;
  private rl: Interface;
  constructor(config: Config) {
    super();
    const { url, ...rest } = config;
    logger.debug(`Config: ${JSON.stringify(config, null, 2)}`);
    this.config = rest;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  close() {
    this.rl.close();
  }
  getCommands() {
    return this.commands;
  }
  private register() {
    this.rl.on("line", async (message) => {
      if (message.startsWith(this.config.settings.commandPrefix)) {
        const [parsedCommand, ...rest] = message.substring(1).split(" ");
        const command = this.commands.find(
          ({ name }) => name === parsedCommand,
        );
        if (command) {
          const result = await command.handler(...rest);
          console.log(result);
          this.rl.prompt();
        } else {
          console.log("Error: command not found");
          this.rl.prompt();
        }
      } else {
        this.emit("message", {
          message,
          source: `+1${process.env.SIGNAL_USER_ADMIN_NUMBER}`,
        });
      }
    });
  }
  async start(commandPrefix: string) {
    this.register();
    this.emit("ready");
    this.hasStarted = true;
    this.sendMessage(
      `Signal Bot Started!\n\nBot is now active\nNumber: ${this.config.phoneNumber}\n\nTo view available commands, send "${commandPrefix}help".\n\nHappy chatting!`,
    );
  }
  addCommand(command: Command) {
    this.commands.push(command);
    if (this.hasStarted) {
      this.register();
    }
  }
  sendMessage(message: string) {
    console.log(message);
    this.rl.prompt();
  }
}
