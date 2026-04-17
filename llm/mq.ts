import { type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export class MessageQueue {
  private queue: SDKUserMessage[] = [];
  // Holds resolve functions for promises waiting for new messages
  private resolvers: ((value: SDKUserMessage | null) => void)[] = [];

  /**
   * Push incoming messages here
   */
  public enqueue(message: string) {
    const userMessage = {
      type: "user" as const,
      session_id: "is this needed",
      message: {
        role: "user" as const,
        content: message, //[{ type: "text", text: message }],
      },
      parent_tool_use_id: null,
    };
    if (this.resolvers.length > 0) {
      // If the generator is waiting, resolve the oldest promise immediately
      const resolve = this.resolvers.shift();
      resolve!(userMessage);
    } else {
      // Otherwise, queue the message for later
      this.queue.push(userMessage);
    }
  }

  /**
   * Call this when the app closes to end the async iterator
   */
  public close() {
    // Resolve all waiting promises with null to signal completion
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve!(null);
    }
  }

  /**
   * The actual async generator implementation
   */
  public async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        // Yield from the buffer if we have messages
        yield this.queue.shift()!;
      } else {
        // Otherwise, create a Promise and wait for the next enqueue() call
        const nextMessage = await new Promise<SDKUserMessage | null>(
          (resolve) => {
            this.resolvers.push(resolve);
          },
        );

        // If close() was called, nextMessage will be null. Break the loop.
        if (nextMessage === null) {
          break;
        }

        yield nextMessage;
      }
    }
  }
}
