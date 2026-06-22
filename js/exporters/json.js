export function buildJSON(data, meta = {}) {
  const payload = {
    meta,
    exportedAt: new Date().toISOString(),
    entries: data
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
}
