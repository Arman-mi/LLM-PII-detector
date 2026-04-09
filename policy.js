(function () {
  const DEFAULT_POLICY = {
    EMAIL: "WARN",
    PHONE: "WARN",
    SSN: "BLOCK",
    CREDIT_CARD: "BLOCK",
    IP_ADDRESS: "WARN",
    CUSTOM_TERM: "REDACT"
  };

  function getSeverity(type) {
    switch (type) {
      case "SSN":
      case "CREDIT_CARD":
        return "high";
      case "EMAIL":
      case "PHONE":
      case "CUSTOM_TERM":
        return "medium";
      case "IP_ADDRESS":
      default:
        return "low";
    }
  }

  function evaluateDetections(detections, customPolicy = {}) {
    const policy = { ...DEFAULT_POLICY, ...customPolicy };

    let finalAction = "ALLOW";

    for (const d of detections) {
      d.severity = getSeverity(d.type);
      d.action = policy[d.type] || "WARN";

      if (d.action === "BLOCK") {
        finalAction = "BLOCK";
      } else if (d.action === "REDACT" && finalAction !== "BLOCK") {
        finalAction = "REDACT";
      } else if (d.action === "WARN" && finalAction === "ALLOW") {
        finalAction = "WARN";
      }
    }

    return {
      detections,
      finalAction,
      policy
    };
  }

  window.MiniTectoPolicy = {
    DEFAULT_POLICY,
    evaluateDetections
  };
})();
