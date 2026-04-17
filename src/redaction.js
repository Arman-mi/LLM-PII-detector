function makePlaceholder(type, counters) {
  counters[type] = (counters[type] || 0) + 1;
  return `[${type}_${counters[type]}]`;
}

export function applyRedactions(text, detections, mode = "policy") {
  if (!detections?.length) {
  return { redactedText: text, replacements: {} };
}

  const counters = {};
  const replacements = {};
  let result = "";
  let cursor = 0;

  const safeDetections = detections.filter(
  (d) =>
    typeof d.start === "number" &&
    typeof d.end === "number" &&
    d.start >= 0 &&
    d.end > d.start
).sort((a, b) => a.start - b.start);

for (const d of safeDetections) {
    result += text.slice(cursor, d.start);

    const shouldReplace =
      mode === "all" || d.action === "REDACT" || d.action === "BLOCK";

    if (shouldReplace) {
      const placeholder = makePlaceholder(d.type, counters);
      replacements[placeholder] = {
        original: d.text,
        type: d.type,
        index: counters[d.type]
      };
      result += placeholder;
    } else {
      result += d.text;
    }

    cursor = d.end;
  }

  result += text.slice(cursor);
  return { redactedText: result, replacements };
}

export function restoreRedactions(text, replacements) {
  if (!replacements) return text;
  let restored = text;

  for (const [placeholder, data] of Object.entries(replacements)) {
    restored = restored.split(placeholder).join(data.original);
  }

  return restored;
}