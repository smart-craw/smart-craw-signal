import { type Query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../logging.ts";
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
  query: Query,
  //id: string,
  onComplete: (fullMessage: string, isError: boolean) => void,
) {
  //let isThinking = false; //default to no thinking
  //need to ensure the app doesn't completely crash if claude errors
  try {
    for await (const msg of query) {
      switch (msg.type) {
        //"result" always fires, so no need to action "assistant" type
        /*case "stream_event": {
          const { event } = msg;
          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              isThinking = streamUtils.detectThinking(
                event.delta.text,
                isThinking,
              );
              streamUtils.sendMessage(event.delta.text, id, isThinking);
            }
          }
          break;
          }*/
        case "result": {
          if (msg.subtype === "success") {
            const { result } = msg;
            onComplete(result, false);
          } else {
            const errorText = msg.errors.reduce(
              (aggr, curr) => `${aggr}, ${curr}`,
            );
            onComplete(errorText, true);
            logger.error(`Error! ${errorText}`);
          }
          break;
        }
        default: {
          logger.debug(`uncaught type ${msg}`);
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    onComplete(error.message, true);
    logger.error(`Error! ${error.name}: ${error.message}`);
  }
}
