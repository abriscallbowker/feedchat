/** Parses SSE lines like `data: {"delta":"..."}` and `data: [DONE]`. */

function parseDataLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return "";
  const payload = trimmed.slice(5).trimStart();
  if (payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload) as { delta?: string };
    return typeof parsed.delta === "string" ? parsed.delta : "";
  } catch {
    return "";
  }
}

export function createSseDeltaAccumulator() {
  let lineBuffer = "";

  return {
    append(chunk: string): string {
      lineBuffer += chunk;
      let out = "";
      let nl: number;
      while ((nl = lineBuffer.indexOf("\n")) >= 0) {
        const line = lineBuffer.slice(0, nl).replace(/\r$/, "");
        lineBuffer = lineBuffer.slice(nl + 1);
        out += parseDataLine(line);
      }
      return out;
    },
    flush(): string {
      if (!lineBuffer.trim()) return "";
      const line = lineBuffer.replace(/\r$/, "");
      lineBuffer = "";
      return parseDataLine(line);
    }
  };
}
