const textarea = document.getElementById("customTerms");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");

const policyKeys = [
  "EMAIL",
  "PHONE",
  "SSN",
  "CREDIT_CARD",
  "IP_ADDRESS",
  "CUSTOM_TERM",
  "POTENTIAL_ID"
];

const defaultPolicy = {
  EMAIL: "REDACT",
  PHONE: "WARN",
  SSN: "BLOCK",
  CREDIT_CARD: "BLOCK",
  IP_ADDRESS: "WARN",
  CUSTOM_TERM: "REDACT",
  POTENTIAL_ID: "WARN"
};

function loadOptions() {
  chrome.storage.local.get(["customTerms", "policyConfig"], (result) => {
    const terms = result.customTerms || [];
    const policyConfig = { ...defaultPolicy, ...(result.policyConfig || {}) };

    textarea.value = terms.join("\n");

    for (const key of policyKeys) {
      const el = document.getElementById(key);
      if (el) el.value = policyConfig[key];
    }
  });
}

function saveOptions() {
  const terms = textarea.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const policyConfig = {};
  for (const key of policyKeys) {
    const el = document.getElementById(key);
    if (el) policyConfig[key] = el.value;
  }

  chrome.storage.local.set({ customTerms: terms, policyConfig }, () => {
    status.textContent = "Saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  });
}

saveBtn.addEventListener("click", saveOptions);
loadOptions();