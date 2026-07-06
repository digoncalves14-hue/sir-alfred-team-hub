import { describe, it, expect } from "vitest";
import { parseSSELine } from "./sseStream";

describe("parseSSELine", () => {
  it("extracts delta content from a data line", () => {
    const line = `data: ${JSON.stringify({ choices: [{ delta: { content: "Olá" } }] })}`;
    expect(parseSSELine(line)).toEqual({ content: "Olá", done: false });
  });

  it("signals completion on [DONE]", () => {
    expect(parseSSELine("data: [DONE]")).toEqual({ done: true });
  });

  it("ignores comments and blank lines", () => {
    expect(parseSSELine(": keep-alive")).toBeNull();
    expect(parseSSELine("")).toBeNull();
  });

  it("ignores non-data lines", () => {
    expect(parseSSELine("event: message")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSSELine("data: {not json")).toBeNull();
  });

  it("handles trailing carriage return", () => {
    const line = `data: ${JSON.stringify({ choices: [{ delta: { content: "Oi" } }] })}\r`;
    expect(parseSSELine(line)).toEqual({ content: "Oi", done: false });
  });
});
