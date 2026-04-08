(function () {
  function luhnCheck(num) {
    const digits = num.replace(/\D/g, "");
    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
  }

  function findMatches(text, regex, type, reason, validator = null) {
    const matches = [];
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      if (validator && !validator(value)) continue;

      matches.push({
        id: crypto.randomUUID(),
        type,
        text: value,
        start: match.index,
        end: match.index + value.length,
        reason
      });
    }
    return matches;
  }

  function detectPII(text, customTerms = []) {
    const detections = [];

    detections.push(
      ...findMatches(
        text,
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        "EMAIL",
        "Matched email pattern"
      )
    );

    detections.push(
      ...findMatches(
        text,
        /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
        "PHONE",
        "Matched phone number pattern"
      )
    );

    detections.push(
      ...findMatches(
        text,
        /\b\d{3}-\d{2}-\d{4}\b/g,
        "SSN",
        "Matched SSN pattern"
      )
    );

    detections.push(
      ...findMatches(
        text,
        /\b(?:\d[ -]*?){13,19}\b/g,
        "CREDIT_CARD",
        "Matched credit card pattern and passed Luhn check",
        luhnCheck
      )
    );

    detections.push(
      ...findMatches(
        text,
        /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
        "IP_ADDRESS",
        "Matched IPv4 address pattern"
      )
    );

    for (const term of customTerms) {
      if (!term || !term.trim()) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      detections.push(
        ...findMatches(
          text,
          regex,
          "CUSTOM_TERM",
          `Matched custom sensitive term: ${term}`
        )
      );
    }

    detections.sort((a, b) => a.start - b.start);
    return detections;
  }

  window.MiniTectoDetectors = {
    detectPII
  };
})();
