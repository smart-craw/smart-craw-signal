import { describe, it, expect } from "vitest";
import { parseMessage } from "./response.ts";
describe("parseCompleteMessage", () => {
  it("returns message and reasoning if end think", () => {
    expect(parseMessage("<think>", "</think>", "hello world </think>")).toEqual(
      {
        reasoning: "hello world",
        message: "",
      },
    );
  });
  it("returns message and reasoning if total think", () => {
    expect(
      parseMessage(
        "<think>",
        "</think>",
        "<think>hello world </think>my message",
      ),
    ).toEqual({
      reasoning: "hello world",
      message: "my message",
    });
  });
  it("returns message if no think", () => {
    expect(parseMessage("<think>", "</think>", "my message")).toEqual({
      reasoning: "",
      message: "my message",
    });
  });
});
