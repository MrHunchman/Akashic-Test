import { MAL_STATUS_LABELS } from "./config.js";

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeStatusToMalCode(status) {
  if (status === null || status === undefined) return 0;

  const raw = String(status).trim();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && MAL_STATUS_LABELS[numeric]) return numeric;

  const s = raw.toLowerCase();

  if (["current", "currently_watching", "watching", "reading", "repeating"].includes(s)) return 1;
  if (["completed", "complete", "finished"].includes(s)) return 2;
  if (["paused", "on_hold", "hold", "hiatus"].includes(s)) return 3;
  if (["dropped", "drop"].includes(s)) return 4;
  if (["planning", "plan_to_watch", "plan_to_read", "planned", "plan"].includes(s)) return 6;

  return 0;
}

export function getStatusLabel(code) {
  return MAL_STATUS_LABELS[Number(code)] || "Unknown";
}

export function applyScoreRule(score, rule) {
  const value = Number(score) || 0;

  switch (rule) {
    case "NEAREST":
      return Math.round(value);
    case "UP":
      return Math.ceil(value);
    case "DOWN":
      return Math.floor(value);
    case "KEEP":
    default:
      return value;
  }
}

export function formatDate(input) {
  if (!input) return "";

  if (typeof input === "string") {
    return input.includes("T") ? input.split("T")[0] : input;
  }

  if (typeof input === "object" && input.year) {
    const m = String(input.month || 1).padStart(2, "0");
    const d = String(input.day || 1).padStart(2, "0");
    return `${input.year}-${m}-${d}`;
  }

  return "";
}

export function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function safeCdata(value = "") {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

export function csvEscape(value = "") {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildTitleCandidates(item) {
  return unique([
    item.title,
    ...(item.titleCandidates || []),
  ]);
}
