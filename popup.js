console.log("Mini Tecto popup loaded");
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["auditLog"], (result) => {
    const log = result.auditLog || [];

    const redacts = log.filter((x) => x.event === "redact").length;
    const blocked = log.filter((x) => x.event === "blocked_submission").length;

    document.body.innerHTML = `
      <h3>Mini Tecto</h3>
      <p>Local PII detection is active on supported AI chat pages.</p>
      <p><strong>Redactions:</strong> ${redacts}</p>
      <p><strong>Blocked sends:</strong> ${blocked}</p>
    `;
  });
});
