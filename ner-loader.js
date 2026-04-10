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