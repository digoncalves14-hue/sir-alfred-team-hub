/** Parser incremental de Server-Sent Events (pedaços podem chegar cortados em qualquer ponto). */
export function createSseParser(onEvent: (event: string, data: string) => void) {
  let buffer = "";
  return {
    feed(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) onEvent(event, data.join("\n"));
      }
    },
  };
}
