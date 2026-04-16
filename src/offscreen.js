import { pipeline, env } from "@huggingface/transformers";

let nerPipeline = null;
let nerLoadingPromise = null;

env.allowRemoteModels = true;
env.backends.onnx = env.backends.onnx || {};
env.backends.onnx.wasm = env.backends.onnx.wasm || {};
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("ort/");

async function loadNER() {
  if (nerPipeline) return nerPipeline;
  if (nerLoadingPromise) return nerLoadingPromise;

  console.group("🧠 Mini Tecto Offscreen NER");
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

function normalizeNERResults(results) {
  const normalized = results
    .map((r) => {
      const label = String(r.entity_group || r.entity || "").toUpperCase();

      let type = null;
      if (label.includes("PER")) type = "PERSON";
      else if (label.includes("ORG")) type = "ORG";
      else if (label.includes("LOC")) type = "LOCATION";
      else return null;

      return {
        id: crypto.randomUUID(),
        type,
        text: r.word ?? r.text ?? "",
        start: r.start,
        end: r.end,
        reason: `NER model matched ${label}`,
        confidence: r.score ?? 0
      };
    })
    .filter(Boolean)
    .filter((x) => typeof x.start === "number" && typeof x.end === "number");

  console.group("🧠 Mini Tecto Offscreen NER");
  console.log("Raw NER output:", results);
  console.log("Normalized NER detections:", normalized);
  console.groupEnd();

  return normalized;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "RUN_NER") return;

  (async () => {
    try {
      const ner = await loadNER();
      const raw = await ner(message.text);
      const detections = normalizeNERResults(raw);
      sendResponse({ ok: true, detections });
    } catch (err) {
      console.error("Offscreen NER failed:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true;
});
