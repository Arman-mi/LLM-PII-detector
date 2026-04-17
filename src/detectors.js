
function luhnCheck(num) {
  const digits = num.replace(/\D/g, "");
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function fetchNERDetections(text) {
return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "TEST_NER", text },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("NER messaging failed:", chrome.runtime.lastError);
          resolve([]);
          return;
        }

        if (!response?.ok) {
          console.error("NER response failed:", response?.error || response);
          resolve([]);
          return;
        }

        resolve(response.detections || []);
      }
    );
  });
}

function makeDetection(value, start, end, type, reason) {
  return {
    id: crypto.randomUUID(),
    type,
    text: value,
    start,
    end,
    reason
  };
}

function findMatches(text, regex, type, reason, validator = null) {
  const matches = [];
  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const start = match.index;
    const end = start + value.length;
    if (validator && !validator(value)) continue;
    matches.push(makeDetection(value, start, end, type, reason));
  }
  return matches;
}

function detectPotentialIds(text) {
  const matches = [];
  const patterns = [
    /\b[A-Z]{2,}-\d{3,}[A-Z0-9-]*\b/g,
    /\b(?:ID|EMP|CASE|CUST|ACC|ACCT|USER|CLIENT)[-_:]?[A-Z0-9]{3,}\b/gi,
    /\b[A-Z0-9]*\d[A-Z0-9]*[A-Z][A-Z0-9]*\b/g,
    /\b[A-Z][A-Z0-9]{5,}\b/g,
    /\b\d{7,}\b/g
  ];

  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;

      if (/^\d+$/.test(value)) {
        if (value.length < 7) continue;
        if (luhnCheck(value)) continue;
      }
      if (/^\d{3}-\d{2}-\d{4}$/.test(value)) continue;
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) continue;
      if (/@/.test(value)) continue;

      matches.push(
        makeDetection(value, start, end, "POTENTIAL_ID", "Matched ID-like heuristic pattern")
      );
    }
  }

  return matches;
}

function dedupeAndResolveOverlaps(detections) {
  const priority = {
    SSN: 100,
    CREDIT_CARD: 95,
    EMAIL: 90,
    PHONE: 85,
    IP_ADDRESS: 80,
    CUSTOM_TERM: 75,
    PERSON: 70,
    ORG: 68,
    LOCATION: 66,
    POTENTIAL_ID: 60
  };

  const sorted = [...detections].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aLen = a.end - a.start;
    const bLen = b.end - b.start;
    if (aLen !== bLen) return bLen - aLen;
    return (priority[b.type] || 0) - (priority[a.type] || 0);
  });

  const result = [];
  for (const det of sorted) {
    const overlap = result.find((r) => !(det.end <= r.start || det.start >= r.end));
    if (!overlap) {
      result.push(det);
      continue;
    }

    const currentPriority = priority[det.type] || 0;
    const existingPriority = priority[overlap.type] || 0;
    const currentLen = det.end - det.start;
    const existingLen = overlap.end - overlap.start;

    if (
      currentPriority > existingPriority ||
      (currentPriority === existingPriority && currentLen > existingLen)
    ) {
      result[result.indexOf(overlap)] = det;
    }
  }

  return result.sort((a, b) => a.start - b.start);
}

function detectRegexAndHeuristics(text, customTerms = []) {
  let detections = [];

  detections.push(
    ...findMatches(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "EMAIL", "Matched email pattern"),
    ...findMatches(text, /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "PHONE", "Matched phone number pattern"),
    ...findMatches(text, /\b\d{3}-\d{2}-\d{4}\b/g, "SSN", "Matched SSN pattern"),
    ...findMatches(text, /\b(?:\d[ -]*?){13,19}\b/g, "CREDIT_CARD", "Matched credit card pattern and passed Luhn check", luhnCheck),
    ...findMatches(text, /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g, "IP_ADDRESS", "Matched IPv4 address pattern")
  );

  for (const term of customTerms) {
    if (!term || !term.trim()) continue;
    const regex = new RegExp(escapeRegex(term.trim()), "gi");
    detections.push(
      ...findMatches(text, regex, "CUSTOM_TERM", `Matched custom sensitive term: ${term}`)
    );
  }

  detections.push(...detectPotentialIds(text));
  return detections;
}

export async function detectAllPII(text, customTerms = []) {
  const regexDetections = detectRegexAndHeuristics(text, customTerms);

  let nerDetections = [];
  try {
    nerDetections = await  fetchNERDetections(text);
  } catch (err) {
    console.error("NER failed, continuing with regex/heuristics only:", err);
  }

  const merged = dedupeAndResolveOverlaps([
    ...regexDetections,
    ...nerDetections
  ]);

  console.group("🔎 Mini Tecto Detector Merge");
  console.log("Regex / Heuristic detections:", regexDetections);
  console.log("NER detections:", nerDetections);
  console.log("Merged detections:", merged);
  console.groupEnd();

  return merged;
}