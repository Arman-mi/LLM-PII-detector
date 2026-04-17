export const DEFAULT_POLICY = {
  EMAIL: "REDACT",
  PHONE: "REDACT",
  SSN: "REDACT",
  CREDIT_CARD: "REDACT",
  IP_ADDRESS: "REDACT",
  CUSTOM_TERM: "REDACT",
  POTENTIAL_ID: "REDACT",
  PERSON: "REDACT",
  ORG: "REDACT",
  LOCATION: "REDACT"
};

function getSeverity(type) {
  switch (type) {
    case "SSN":
    case "CREDIT_CARD":
      return "high";
    case "EMAIL":
    case "PHONE":
    case "CUSTOM_TERM":
    case "POTENTIAL_ID":
    case "PERSON":
      return "medium";
    case "ORG":
    case "LOCATION":
    case "IP_ADDRESS":
    default:
      return "low";
  }
}

export function evaluateDetections(detections, customPolicy = {}) {
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