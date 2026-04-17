chrome.runtime.onInstalled.addListener(() => {
  console.log("Mini Tecto installed");
});

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("offscreen.html");

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    });

    if (contexts.length > 0) {
      return;
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "Run local NER in a hidden extension document"
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TEST_NER") return;

  (async () => {
    try {
      await ensureOffscreenDocument();

      const response = await chrome.runtime.sendMessage({
        type: "RUN_NER_OFFSCREEN",
        text: message.text || ""
      });

      sendResponse(response);
    } catch (err) {
      console.error("[Background] offscreen routing failed:", err);
      sendResponse({ ok: false, detections: [], error: String(err) });
    }
  })();

  return true;
});