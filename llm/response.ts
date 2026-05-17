import { logger } from "../logging.ts";
import { AgentResult, type AgentStreamEvent } from "@strands-agents/sdk";
export interface SplitReasoning {
  reasoning: string;
  message: string;
}
export const parseMessage = (
  startThink: string,
  endThink: string,
  text: string,
) => {
  if (text.includes(endThink)) {
    const [reasoning, message] = text.split(endThink);
    return {
      reasoning: reasoning.replace(startThink, "").trim(),
      message: (message || "").trim(),
    } as SplitReasoning;
  } else {
    //not a reasoning model
    return {
      reasoning: "",
      message: text.trim(),
    } as SplitReasoning;
  }
};

export async function handleLLMResponse(
  query: AsyncGenerator<AgentStreamEvent, AgentResult, undefined>,
  onComplete: (fullMessage: string, isError: boolean) => void,
) {
  //need to ensure the app doesn't completely crash if agent errors
  try {
    for await (const msg of query) {
      switch (msg.type) {
        case "agentResultEvent": {
          const { result } = msg;
          if (
            result.stopReason === "endTurn" ||
            result.stopReason === "stopSequence"
          ) {
            onComplete(
              result.lastMessage.content
                .filter((v) => v.type === "textBlock")
                .reduce((agg, curr) => agg + curr.text, ""),
              false,
            );
          } else if (result.stopReason === "interrupt") {
            onComplete(result.toString(), false);
          } else if (
            result.stopReason === "maxTokens" ||
            result.stopReason === "modelContextWindowExceeded"
          ) {
            onComplete(`Stopped: ${result.stopReason}`, true);
          }
          break;
        }

        // Errors surface here
        case "afterModelCallEvent": {
          if (msg.error) {
            onComplete(msg.error.message, true);
          }
          break;
        }

        default: {
          logger.debug(`uncaught type ${JSON.stringify(msg, null, 2)}`);
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    onComplete(error.message, true);
    logger.error(`Error! ${error.name}: ${error.message}`);
  }
}
