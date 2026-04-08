(function () {
  let panel = null;
  let currentInput = null;
  let debounceTimer = null;

  function getChatInput() {
    const candidates = [
      'textarea',
      '[contenteditable="true"]'
    ];

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

  function getInputText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function createPanel() {
    const existing = document.getElementById("mini-tecto-panel");
    if (existing) return existing;

    const div = document.createElement("div");
    div.id = "mini-tecto-panel";
    div.innerHTML = `
      <div class="mini-tecto-header">Mini Tecto</div>
      <div class="mini-tecto-body">No scan yet.</div>
      <div class="mini-tecto-actions">
        <button id="mini-tecto-redact-btn">Redact All</button>
        <button id="mini-tecto-refresh-btn">Rescan</button>
      </div>
    `;
    document.body.appendChild(div);

    div.querySelector("#mini-tecto-refresh-btn").addEventListener("click", runScan);
    div.querySelector("#mini-tecto-redact-btn").addEventListener("click", redactAll);

    return div;
  }

  async function getCustomTerms() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["customTerms"], (result) => {
        resolve(result.customTerms || []);
      });
    });
  }

  async function runScan() {
    if (!currentInput) return;

    const text = getInputText(currentInput);
    const customTerms = await getCustomTerms();
    const detections = window.MiniTectoDetectors.detectPII(text, customTerms);

    panel = createPanel();
    const body = panel.querySelector(".mini-tecto-body");

    if (detections.length === 0) {
      body.innerHTML = `<div>No sensitive items found.</div>`;
      return;
    }

    body.innerHTML = `
      <div><strong>${detections.length}</strong> sensitive item(s) found:</div>
      <ul class="mini-tecto-list">
        ${detections
          .slice(0, 8)
          .map(
            (d) => `
              <li>
                <span class="mini-tecto-type">${d.type}</span>
                <span class="mini-tecto-text">${escapeHtml(d.text)}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    `;
  }

  function redactText(text, detections) {
    if (!detections.length) return text;

    let result = "";
    let cursor = 0;

    for (const d of detections) {
      result += text.slice(cursor, d.start);
      result += `[${d.type}]`;
      cursor = d.end;
    }

    result += text.slice(cursor);
    return result;
  }

  async function redactAll() {
    if (!currentInput) return;

    const text = getInputText(currentInput);
    const customTerms = await getCustomTerms();
    const detections = window.MiniTectoDetectors.detectPII(text, customTerms);

    if (!detections.length) return;

    const redacted = redactText(text, detections);

    if (currentInput.tagName === "TEXTAREA") {
      currentInput.value = redacted;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      currentInput.innerText = redacted;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    runScan();
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
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
