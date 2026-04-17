console.log("Mini Tecto popup loaded");

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    console.error("Failed to message content script:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["auditLog"], (result) => {
    const log = result.auditLog || [];

    const redacts = log.filter((x) => x.event === "redact").length;
    const blocked = log.filter((x) => x.event === "blocked_submission").length;

    const redactionsEl = document.getElementById("redactions-count");
    const blockedEl = document.getElementById("blocked-count");

    if (redactionsEl) redactionsEl.textContent = String(redacts);
    if (blockedEl) blockedEl.textContent = String(blocked);
  });

  const showBtn = document.getElementById("show-panel-btn");
  if (showBtn) {
    showBtn.addEventListener("click", async () => {
      await sendToActiveTab({ type: "MINI_TECTO_SHOW_PANEL" });
      window.close();
    });
  }
});