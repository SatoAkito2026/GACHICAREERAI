// Helpers to extract JSON from Anthropic-style responses.

export function lastTextBlock(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

/**
 * Extract the largest balanced JSON object/array from a text blob and parse it.
 * Tolerates preface prose, markdown code fences, and trailing commentary.
 * Returns the parsed value, or throws if no valid JSON was found.
 */
export function extractJson(text: string): any {
  if (!text) throw new Error("extractJson: empty input");

  // Strip markdown code fences if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  candidates.push(text);

  for (const source of candidates) {
    const parsed = tryBalanced(source);
    if (parsed !== undefined) return parsed;
  }

  throw new Error("extractJson: no valid JSON found in text");
}

function tryBalanced(source: string): any {
  let best: any = undefined;
  let bestLen = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let j = i; j < source.length; j++) {
      const c = source[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          const slice = source.slice(i, j + 1);
          try {
            const parsed = JSON.parse(slice);
            if (slice.length > bestLen) {
              best = parsed;
              bestLen = slice.length;
            }
          } catch {
            // ignore, try next candidate
          }
          break;
        }
      }
    }
  }

  return best;
}
