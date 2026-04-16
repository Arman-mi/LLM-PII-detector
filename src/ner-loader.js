import { pipeline } from "@huggingface/transformers";

let nerPipeline = null;
let nerLoadingPromise = null;

export async function loadNER() {
  if (nerPipeline) return nerPipeline;
  if (nerLoadingPromise) return nerLoadingPromise;

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

export function normalizeNERResults(results) {
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

  console.group("🧠 Mini Tecto NER");
  console.log("Raw NER output:", results);
  console.log("Normalized NER detections:", normalized);
  console.groupEnd();

  return normalized;
}

export async function detectNER(text) {
  if (!text || !text.trim()) return [];

  const ner = await loadNER();
  console.group("🧠 Mini Tecto NER");
  console.log("Input to NER:", text);
  const raw = await ner(text);
  console.log("Raw pipeline output:", raw);
  console.groupEnd();

  return normalizeNERResults(raw);
}