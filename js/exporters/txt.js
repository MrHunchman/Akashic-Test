import { getStatusLabel } from "../utils.js";

export function buildTXT(data, type) {
  let txt = `Akashic Export\n${"=".repeat(30)}\n`;
  txt += `Media Type: ${type}\nTotal Entries: ${data.length}\n\n`;

  for (const item of data) {
    txt += `Title: ${item.title}\n`;
    txt += `Score: ${item.score}/10\n`;
    txt += `Status: ${getStatusLabel(item.malStatus)}\n`;
    txt += `Progress: ${item.progress}\n`;
    txt += `MAL ID: ${item.idMal || "N/A"}\n`;
    txt += `Notes: ${item.notes || ""}\n`;
    txt += `\n`;
  }

  return new Blob([txt], { type: "text/plain;charset=utf-8" });
}
