export type SSEChunk = { content?: string; done: boolean };

/**
 * Parses one line of an OpenAI-compatible SSE stream ("data: {...}" / "data: [DONE]").
 * Returns null for lines that aren't a data payload (comments, blank lines, malformed JSON).
 */
export function parseSSELine(line: string): SSEChunk | null {
  let normalized = line;
  if (normalized.endsWith("\r")) normalized = normalized.slice(0, -1);
  if (normalized.startsWith(":") || normalized.trim() === "") return null;
  if (!normalized.startsWith("data: ")) return null;

  const jsonStr = normalized.slice(6).trim();
  if (jsonStr === "[DONE]") return { done: true };

  try {
    const parsed = JSON.parse(jsonStr);
    const content = parsed.choices?.[0]?.delta?.content as string | undefined;
    return { content, done: false };
  } catch {
    return null;
  }
}

/**
 * Reads an OpenAI-compatible SSE response body, invoking onDelta for each content fragment.
 */
export async function consumeSSEStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const chunk = parseSSELine(line);
      if (!chunk) continue;
      if (chunk.done) {
        done = true;
        break;
      }
      if (chunk.content) onDelta(chunk.content);
    }
  }
}
