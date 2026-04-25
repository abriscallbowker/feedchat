/**
 * Removes Markdown bold (`**` and `__`) for display. Fenced code blocks are unchanged.
 */
export function stripBoldFromMarkdown(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n");
  const fenceRe = /```[\w-]*\n?([\s\S]*?)```/g;
  const chunks: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(normalized)) !== null) {
    chunks.push(stripBoldInMarkdownFragment(normalized.slice(lastIndex, match.index)));
    chunks.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  chunks.push(stripBoldInMarkdownFragment(normalized.slice(lastIndex)));
  return chunks.join("");
}

function stripBoldInMarkdownFragment(text: string): string {
  let current = text;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
    current = current.replace(/__([\s\S]*?)__/g, "$1");
  }
  return current;
}

/**
 * Approximate plain text from Markdown while preserving line breaks.
 * Intended for clipboard copy; not a full CommonMark implementation.
 */
export function stripMarkdownPreservingLineBreaks(source: string): string {
  let s = source.replace(/\r\n/g, "\n");

  // Fenced code blocks — keep inner text
  s = s.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, inner: string) => {
    const t = inner.trim();
    return t ? `${t}\n` : "";
  });

  // GFM table separator rows
  s = s.replace(/^\s*\|?\s*:?[-\s:|]+\|?\s*$/gm, "");

  // Table rows: split cells into plain text
  s = s.replace(/^\s*\|(.+)\|\s*$/gm, (_, inner: string) =>
    inner
      .split("|")
      .map((c: string) => c.trim())
      .filter(Boolean)
      .join(" "),
  );

  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  s = s.replace(/<https?:\/\/[^>\s]+>/gi, (m) => m.slice(1, -1));

  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");

  s = s.replace(/^>\s?/gm, "");
  s = s.replace(/^[\t ]*[-*+]\s+/gm, "");
  s = s.replace(/^[\t ]*\d+\.\s+/gm, "");
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, "");

  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
