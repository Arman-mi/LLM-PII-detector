let nerClassifier = null;
let nerLoadingPromise = null;

export async function loadNER() {
  if (nerClassifier) return nerClassifier;
  if (nerLoadingPromise) return nerLoadingPromise;

  nerLoadingPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");

    nerClassifier = await pipeline(
      "token-classification",
      "onnx-community/TinyBERT-finetuned-NER-ONNX",
      {
        device: "wasm",
      }
    );

    return nerClassifier;
  })();

  return nerLoadingPromise;
}

export async function detectNER(text) {
  const classifier = await loadNER();
  const output = await classifier(text);
  return output;
}

export function normalizeNERResults(results) {
  return results
    .map((r) => {
      const label = (r.entity_group || r.entity || "").toUpperCase();

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
}