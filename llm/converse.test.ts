import { describe, it, expect, vi } from "vitest";
import { approvalWrapper } from "./converse.ts";
describe("approvalWrapper", () => {
  it("returns allow message if approve", async () => {
    const aq = new Map<string, (approved: boolean) => void>();
    const id = "123";
    const sendMessage = vi.fn();
    const approvalCb = approvalWrapper(id, aq, sendMessage);
    //runs async
    const functionCall = approvalCb("sometool", { hello: "world" });
    expect(sendMessage).toHaveBeenCalledWith(
      "sometool",
      JSON.stringify({ hello: "world" }, null, 2),
    );

    //functionCall is now waiting for an approval to resolve
    aq.get(id)!(true); //now approve

    const result = await functionCall;

    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { hello: "world" },
    });
  });
  it("returns deny message if not approved", async () => {
    const aq = new Map<string, (approved: boolean) => void>();
    const id = "123";
    const sendMessage = vi.fn();
    const approvalCb = approvalWrapper(id, aq, sendMessage);
    //runs async
    const functionCall = approvalCb("sometool", { hello: "world" });
    expect(sendMessage).toHaveBeenCalledWith(
      "sometool",
      JSON.stringify({ hello: "world" }, null, 2),
    );

    //functionCall is now waiting for an approval to resolve
    aq.get(id)!(false); //now deny

    const result = await functionCall;

    expect(result).toEqual({ behavior: "deny", message: "Tool use denied" });
  });
});
