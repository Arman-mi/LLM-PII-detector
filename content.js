(function () {
  let panel = null;
  let currentInput = null;
  let debounceTimer = null;
  let lastScan = null;
  let lastOriginalText = null;
  let listenersAttached = false;

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
      const label =
        (btn.innerText || "").toLowerCase() +
        " " +
        (btn.getAttribute("aria-label") || "").toLowerCase();

      return (
        label.includes("send") ||
        label.includes("submit") ||
        btn.querySelector('svg')
      );
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
      return;
    }

    el.innerText = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
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

  async function runScan() {
    if (!currentInput) return;

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

  function redactText(text, detections, mode = "policy") {
    if (!detections.length) return text;

    let result = "";
    let cursor = 0;

    for (const d of detections) {
      result += text.slice(cursor, d.start);

      const shouldReplace =
        mode === "all" ||
        d.action === "REDACT" ||
        d.action === "BLOCK";

      result += shouldReplace ? `[${d.type}]` : d.text;
      cursor = d.end;
    }

    result += text.slice(cursor);
    return result;
  }

  async function redactByPolicy() {
    if (!currentInput || !lastScan) return;

    const text = getInputText(currentInput);
    if (lastOriginalText === null) {
      lastOriginalText = text;
    }

    const redacted = redactText(text, lastScan.detections, "policy");
    setInputText(currentInput, redacted);

    await appendAuditLog({
      event: "redact",
      count: lastScan.detections.length,
      finalAction: lastScan.finalAction
    });

    runScan();
  }

  async function restoreOriginal() {
    if (!currentInput || lastOriginalText === null) return;

    setInputText(currentInput, lastOriginalText);

    await appendAuditLog({
      event: "restore"
    });

    lastOriginalText = null;
    runScan();
  }

  async function enforceBeforeSend(e) {
    if (!currentInput) return;

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
    if (!input || input === currentInput) return;
    currentInput = input;

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runScan, 250);
    });

    runScan();
  }

  function init() {
    panel = createPanel();
    attachSendInterceptors();

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