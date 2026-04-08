const textarea = document.getElementById("customTerms");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");

function loadOptions() {
  chrome.storage.local.get(["customTerms"], (result) => {
    const terms = result.customTerms || [];
    textarea.value = terms.join("\n");
  });
}

function saveOptions() {
  const terms = textarea.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  chrome.storage.local.set({ customTerms: terms }, () => {
    status.textContent = "Saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  });
}

saveBtn.addEventListener("click", saveOptions);
loadOptions();
