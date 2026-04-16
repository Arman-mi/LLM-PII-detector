import { detectAllPII } from "./detectors.js";
import { evaluateDetections } from "./policy.js";
import { applyRedactions, restoreRedactions } from "./redaction.js";
(function () {
  let panel = null;
  let currentInput = null;
  let debounceTimer = null;
  let lastScan = null;
  let lastRedactionSession = null;
  let listenersAttached = false;
  let rehydrateObserver = null;

  function getChatInput() {
    const candidates = ["textarea", '[contenteditable="true"]'];

    for (const selector of candidates) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 20) {
          return el;
        }
      }
    }

    return null;
  }

  function getSendButtons() {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.filter((btn) => {
      const text = (btn.innerText || "").toLowerCase();
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      return text.includes("send") || aria.includes("send");
    });
  }

  function getInputText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function setInputText(el, value) {
    if (!el) return;

    if (el.tagName === "TEXTAREA") {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function createPanel() {
    const existing = document.getElementById("mini-tecto-panel");
    if (existing) return existing;

    const div = document.createElement("div");
    div.id = "mini-tecto-panel";
    div.innerHTML = `
      <div class="mini-tecto-header">Mini Tecto</div>
      <div class="mini-tecto-status mini-tecto-status-neutral">No scan yet.</div>
      <div class="mini-tecto-body"></div>
      <div class="mini-tecto-actions">
        <button id="mini-tecto-redact-btn">Redact</button>
        <button id="mini-tecto-restore-btn">Restore</button>
        <button id="mini-tecto-refresh-btn">Rescan</button>
      </div>
    `;
    document.body.appendChild(div);

    div.querySelector("#mini-tecto-refresh-btn").addEventListener("click", runScan);
    div.querySelector("#mini-tecto-redact-btn").addEventListener("click", redactByPolicy);
    div.querySelector("#mini-tecto-restore-btn").addEventListener("click", restoreOriginal);

    return div;
  }

  function updateStatus(text, cls) {
    panel = createPanel();
    const status = panel.querySelector(".mini-tecto-status");
    status.className = `mini-tecto-status ${cls}`;
    status.textContent = text;
  }

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["customTerms", "policyConfig"], (result) => {
        resolve({
          customTerms: result.customTerms || [],
          policyConfig: result.policyConfig || {}
        });
      });
    });
  }

  async function appendAuditLog(event) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["auditLog"], (result) => {
        const current = result.auditLog || [];
        current.push({
          ...event,
          ts: new Date().toISOString()
        });

        chrome.storage.local.set(
          { auditLog: current.slice(-200) },
          () => resolve()
        );
      });
    });
  }

  function renderResult(scanResult) {
    panel = createPanel();
    const body = panel.querySelector(".mini-tecto-body");

    if (!scanResult || scanResult.detections.length === 0) {
      updateStatus("No sensitive items found.", "mini-tecto-status-safe");
      body.innerHTML = `<div>No issues detected.</div>`;
      return;
    }

    if (scanResult.finalAction === "BLOCK") {
      updateStatus(
        `${scanResult.detections.length} sensitive item(s): submission blocked`,
        "mini-tecto-status-block"
      );
    } else if (scanResult.finalAction === "REDACT") {
      updateStatus(
        `${scanResult.detections.length} sensitive item(s): redaction recommended`,
        "mini-tecto-status-warn"
      );
    } else {
      updateStatus(
        `${scanResult.detections.length} sensitive item(s): warning`,
        "mini-tecto-status-warn"
      );
    }

    body.innerHTML = `
      <ul class="mini-tecto-list">
        ${scanResult.detections
          .slice(0, 10)
          .map(
            (d) => `
              <li>
                <div>
                  <span class="mini-tecto-type">${d.type}</span>
                  <span class="mini-tecto-action">${d.action}</span>
                </div>
                <div class="mini-tecto-text">${escapeHtml(d.text)}</div>
                <div class="mini-tecto-reason">${escapeHtml(d.reason)}</div>
              </li>
            `
          )
          .join("")}
      </ul>
    `;
  }

  function hasActiveReplacements() {
    return !!(
      lastRedactionSession &&
      lastRedactionSession.replacements &&
      Object.keys(lastRedactionSession.replacements).length > 0
    );
  }

  function rehydrateString(text, replacements) {
    if (!text || !replacements) return text;

    let result = text;
    for (const [placeholder, data] of Object.entries(replacements)) {
      result = result.split(placeholder).join(data.original);
    }
    return result;
  }

  function shouldSkipNode(node) {
    if (!node || !node.parentElement) return true;

    const parent = node.parentElement;

    if (parent.closest("#mini-tecto-panel")) return true;
    if (parent.closest("textarea")) return true;
    if (parent.closest('[contenteditable="true"]')) return true;
    if (parent.closest("script, style, noscript")) return true;

    return false;
  }

  function rehydrateTextNodes(root) {
    if (!hasActiveReplacements() || !root) return 0;

    const replacements = lastRedactionSession.replacements;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          if (shouldSkipNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          const containsPlaceholder = Object.keys(replacements).some((ph) =>
            node.nodeValue.includes(ph)
          );

          return containsPlaceholder
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let changedCount = 0;
    const nodesToUpdate = [];

    while (walker.nextNode()) {
      nodesToUpdate.push(walker.currentNode);
    }

    for (const textNode of nodesToUpdate) {
      const original = textNode.nodeValue;
      const rehydrated = rehydrateString(original, replacements);

      if (rehydrated !== original) {
        textNode.nodeValue = rehydrated;
        changedCount++;
      }
    }

    return changedCount;
  }

  async function rehydrateVisibleConversation() {
    if (!hasActiveReplacements()) return;

    const changed = rehydrateTextNodes(document.body);

    if (changed > 0) {
      await appendAuditLog({
        event: "rehydrate_visible_text",
        changedNodes: changed,
        placeholders: Object.keys(lastRedactionSession.replacements).length
      });
    }
  }

  function startRehydrateObserver() {
    if (rehydrateObserver) return;

    rehydrateObserver = new MutationObserver(() => {
      if (!hasActiveReplacements()) return;

      clearTimeout(window.__miniTectoRehydrateTimer);
      window.__miniTectoRehydrateTimer = setTimeout(() => {
        rehydrateVisibleConversation();
      }, 150);
    });

    rehydrateObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  async function runScan() {
    const latestInput = getChatInput();
    if (latestInput && latestInput !== currentInput) {
      attachListener(latestInput);
    }

    if (!latestInput && !currentInput) return;

    currentInput = latestInput || currentInput;

    const text = getInputText(currentInput);
    const { customTerms, policyConfig } = await getSettings();
    const detections = window.MiniTectoDetectors.detectPII(text, customTerms);
    const scanResult = window.MiniTectoPolicy.evaluateDetections(
      detections,
      policyConfig
    );

    lastScan = scanResult;
    renderResult(scanResult);
  }

  async function redactByPolicy() {
    const latestInput = getChatInput();
    if (latestInput) {
      currentInput = latestInput;
    }

    if (!currentInput) return;

    await runScan();
    if (!lastScan) return;

    const currentText = getInputText(currentInput);
    console.group("🛡️ Mini Tecto Redaction");
  console.log("Original Input:", currentText);
  console.log("Detections:", lastScan.detections);


    const result = window.MiniTectoRedaction.applyRedactions(
      currentText,
      lastScan.detections,
      "policy"
    );
    console.log("Replacement Map:", result.replacements);
  console.log("Redacted Output:", result.redactedText);


    lastRedactionSession = {
      replacements: result.replacements,
      createdAt: Date.now()
    };

    setInputText(currentInput, result.redactedText);

    await appendAuditLog({
      event: "redact",
      count: lastScan.detections.length,
      finalAction: lastScan.finalAction,
      placeholders: Object.keys(result.replacements).length
    });

    setTimeout(async () => {
      await runScan();
      await rehydrateVisibleConversation();
    }, 50);
  }

  async function restoreOriginal() {
    const latestInput = getChatInput();
    if (latestInput) {
      currentInput = latestInput;
    }

    if (!currentInput || !lastRedactionSession) return;

    const currentText = getInputText(currentInput);
    const restored = window.MiniTectoRedaction.restoreRedactions(
      currentText,
      lastRedactionSession.replacements
    );

    setInputText(currentInput, restored);

    const changed = rehydrateTextNodes(document.body);

    await appendAuditLog({
      event: "restore",
      placeholders: Object.keys(lastRedactionSession.replacements).length,
      changedNodes: changed
    });

    setTimeout(runScan, 50);
  }

  async function enforceBeforeSend(e) {
    if (!currentInput) return true;

    const text = getInputText(currentInput);
    const { customTerms, policyConfig } = await getSettings();
    const detections = window.MiniTectoDetectors.detectPII(text, customTerms);
    const scanResult = window.MiniTectoPolicy.evaluateDetections(
      detections,
      policyConfig
    );

    lastScan = scanResult;
    renderResult(scanResult);

    if (scanResult.finalAction === "BLOCK") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      await appendAuditLog({
        event: "blocked_submission",
        count: scanResult.detections.length
      });

      updateStatus(
        "Blocked: remove or redact high-severity items before sending.",
        "mini-tecto-status-block"
      );

      return false;
    }

    return true;
  }

  function attachSendInterceptors() {
    if (listenersAttached) return;
    listenersAttached = true;

    document.addEventListener(
      "keydown",
      async (e) => {
        const input = getChatInput();
        if (!input) return;

        const isCurrent =
          document.activeElement === input || input.contains(document.activeElement);

        if (isCurrent && e.key === "Enter" && !e.shiftKey) {
          const ok = await enforceBeforeSend(e);
          if (!ok) return false;
        }
      },
      true
    );

    document.addEventListener(
      "click",
      async (e) => {
        const target = e.target.closest("button");
        if (!target) return;

        const sendButtons = getSendButtons();
        if (sendButtons.includes(target)) {
          await enforceBeforeSend(e);
        }
      },
      true
    );
  }

  function attachListener(input) {
    if (!input) return;

    if (input !== currentInput) {
      currentInput = input;
    }

    if (input.dataset.miniTectoBound === "true") {
      return;
    }

    input.dataset.miniTectoBound = "true";

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runScan, 250);
    });

    runScan();
  }

  function init() {
    panel = createPanel();
    attachSendInterceptors();
    startRehydrateObserver();

    const observer = new MutationObserver(() => {
      const input = getChatInput();
      if (input) attachListener(input);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const input = getChatInput();
    if (input) attachListener(input);
  }

  init();
})();