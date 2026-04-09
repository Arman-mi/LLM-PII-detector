(function () {
  function makePlaceholder(type, counters) {
    counters[type] = (counters[type] || 0) + 1;
    return `[${type}_${counters[type]}]`;
  }

  function applyRedactions(text, detections) {
    const counters = {};
    const replacements = {};
    let result = "";
    let cursor = 0;

    for (const d of detections) {
      result += text.slice(cursor, d.start);

      const placeholder = makePlaceholder(d.type, counters);
      replacements[placeholder] = {
        original: d.text,
        type: d.type,
        index: counters[d.type]
      };

      result += placeholder;
      cursor = d.end;
    }

    result += text.slice(cursor);

    return {
      redactedText: result,
      replacements
    };
  }

  function restoreRedactions(text, replacements) {
    let restored = text;
    for (const [placeholder, data] of Object.entries(replacements)) {
      restored = restored.split(placeholder).join(data.original);
    }
    return restored;
  }

  window.MiniTectoRedaction = {
    applyRedactions,
    restoreRedactions
  };
})();
