import { pipeline, env } from "@huggingface/transformers";

console.log("[Offscreen] real NER script loaded");

env.allowRemoteModels = true;
env.backends.onnx = env.backends.onnx || {};
env.backends.onnx.wasm = env.backends.onnx.wasm || {};
env.backends.onnx.wasm.wasmPaths =  chrome.runtime.getURL("dist-offscreen/ort/");

let nerPipeline = null;
let nerLoadingPromise = null;

async function loadNER() {
  if (nerPipeline) return nerPipeline;
  if (nerLoadingPromise) return nerLoadingPromise;

  console.group("🧠 [Offscreen] Loading NER");
  console.log("Using local ORT wasm path:", env.backends.onnx.wasm.wasmPaths);
  console.groupEnd();

  nerLoadingPromise = pipeline(
    "token-classification",
    "onnx-community/TinyBERT-finetuned-NER-ONNX",
    {
      device: "wasm",
      dtype: "q8"
    }
  );

  nerPipeline = await nerLoadingPromise;
  return nerPipeline;
}

function mapLabelToType(rawLabel) {
  const label = String(rawLabel || "").toUpperCase();

  if (label.includes("PER")) return "PERSON";
  if (label.includes("ORG")) return "ORG";
  if (label.includes("LOC")) return "LOCATION";

  if (label === "LABEL_1" || label === "LABEL_2") return "PERSON";
  if (label === "LABEL_3" || label === "LABEL_4") return "ORG";
  if (label === "LABEL_5" || label === "LABEL_6") return "LOCATION";

  return null;
}

function cleanTokenWord(word) {
  return String(word || "").replace(/^##/, "");
}

function reconstructOffsets(results, sourceText) {
  const lowerSource = sourceText.toLowerCase();
  let cursor = 0;

  return results.map((r) => {
    const rawWord = r.word ?? r.text ?? "";
    const token = cleanTokenWord(rawWord).toLowerCase();

    if (!token) {
      return { ...r, start: null, end: null };
    }

    let start = -1;
    let end = -1;

    // subword token: attach to current cursor area
    if (String(rawWord).startsWith("##")) {
      const searchStart = Math.max(0, cursor - 10);
      start = lowerSource.indexOf(token, searchStart);
      if (start !== -1) {
        end = start + token.length;
        cursor = end;
      }
    } else {
      start = lowerSource.indexOf(token, cursor);
      if (start === -1) {
        // fallback search slightly earlier in case tokenization spacing was odd
        const fallbackStart = Math.max(0, cursor - 20);
        start = lowerSource.indexOf(token, fallbackStart);
      }

      if (start !== -1) {
        end = start + token.length;
        cursor = end;
      }
    }

    return {
      ...r,
      start: start !== -1 ? start : null,
      end: end !== -1 ? end : null
    };
  });
}

function normalizeNERResults(results, sourceText) {
  console.group("🧠 [Offscreen] NER normalize");
  console.log("Raw NER output:", results);
  console.log(
    "Raw labels:",
    results.map((r) => r.entity_group || r.entity || r.label || "UNKNOWN")
  );

  const withOffsets = reconstructOffsets(results, sourceText);

  console.log("Offset reconstruction preview:", withOffsets);

  const normalized = withOffsets
    .map((r) => {
      const rawLabel = r.entity_group || r.entity || r.label || r.entity || "";
      const type = mapLabelToType(rawLabel);

      if (!type) return null;
      if (typeof r.start !== "number" || typeof r.end !== "number") return null;

      return {
        type,
        text: sourceText.slice(r.start, r.end),
        start: r.start,
        end: r.end,
        reason: `NER model matched ${rawLabel}`,
        confidence: r.score ?? 0,
        rawWord: r.word ?? r.text ?? ""
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const item of normalized) {
    const prev = merged[merged.length - 1];

    if (
      prev &&
      prev.type === item.type &&
      item.start <= prev.end + 2
    ) {
      prev.end = item.end;
      prev.text = sourceText.slice(prev.start, prev.end);
      prev.confidence = Math.max(prev.confidence, item.confidence);
    } else {
      merged.push({
        type: item.type,
        text: item.text,
        start: item.start,
        end: item.end,
        reason: item.reason,
        confidence: item.confidence
      });
    }
  }

  console.log("Normalized detections:", normalized);
  console.log("Merged detections:", merged);
  console.groupEnd();

  return merged;
}

function textSliceSafe(sourceText, start, end) {
  if (!sourceText || typeof start !== "number" || typeof end !== "number") {
    return null;
  }
  return sourceText.slice(start, end);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "RUN_NER_OFFSCREEN") return;

  (async () => {
    try {
      const text = (message.text || "").trim();

      console.group("🧠 [Offscreen] RUN_NER_OFFSCREEN");
      console.log("Input text:", text);
      console.groupEnd();

      if (!text) {
        sendResponse({ ok: true, detections: [] });
        return;
      }

      const ner = await loadNER();
      const raw = await ner(text);
      const detections = normalizeNERResults(raw,text);

      sendResponse({
        ok: true,
        detections
      });
    } catch (err) {
      console.error("[Offscreen] NER failed:", err);
      sendResponse({
        ok: false,
        detections: [],
        error: String(err)
      });
    }
  })();

  return true;
});