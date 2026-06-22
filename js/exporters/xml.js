import { escapeXml, safeCdata, normalizeStatusToMalCode } from "../utils.js";

function legacyStatusText(statusCode, isAnime) {
  const code = normalizeStatusToMalCode(statusCode);

  if (isAnime) {
    switch (code) {
      case 1: return "Watching";
      case 2: return "Completed";
      case 3: return "On Hold";
      case 4: return "Dropped";
      case 6: return "Plan to Watch";
      default: return "Plan to Watch";
    }
  }

  switch (code) {
    case 1: return "Reading";
    case 2: return "Completed";
    case 3: return "On Hold";
    case 4: return "Dropped";
    case 6: return "Plan to Read";
    default: return "Plan to Read";
  }
}

function yesNo(value) {
  return Number(value) > 0 ? "YES" : "NO";
}

function dateOrZero(value) {
  if (!value) return "0000-00-00";
  return String(value);
}

function scoreOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildAnimeEntry(item) {
  const rewatchCount = Number(item.rewatches || 0);

  return [
    "  <anime>",
    `    <anime_animedb_id>${escapeXml(item.idMal || "")}</anime_animedb_id>`,
    `    <anime_title>${safeCdata(item.title || "")}</anime_title>`,
    "    <anime_num_episodes>0</anime_num_episodes>",
    `    <my_watched_episodes>${escapeXml(item.progress || 0)}</my_watched_episodes>`,
    `    <my_start_date>${escapeXml(dateOrZero(item.startDate))}</my_start_date>`,
    `    <my_finish_date>${escapeXml(dateOrZero(item.finishDate))}</my_finish_date>`,
    `    <my_score>${escapeXml(scoreOrZero(item.score))}</my_score>`,
    `    <my_status>${legacyStatusText(item.malStatus ?? item.status, true)}</my_status>`,
    `    <my_comments>${safeCdata(item.notes || "")}</my_comments>`,
    `    <my_tags>${safeCdata(item.notes || "")}</my_tags>`,
    `    <my_rewatching>${yesNo(rewatchCount)}</my_rewatching>`,
    `    <my_rewatching_ep>0</my_rewatching_ep>`,
    "    <my_priority>Low</my_priority>",
    "    <my_storage></my_storage>",
    "    <my_discuss>YES</my_discuss>",
    "    <my_sns>default</my_sns>",
    "    <update_on_import>1</update_on_import>",
    "  </anime>"
  ].join("\n");
}

function buildMangaEntry(item) {
  const rereadCount = Number(item.rewatches || 0);

  return [
    "  <manga>",
    `    <manga_mangadb_id>${escapeXml(item.idMal || "")}</manga_mangadb_id>`,
    `    <manga_title>${safeCdata(item.title || "")}</manga_title>`,
    "    <manga_volumes>0</manga_volumes>",
    "    <manga_chapters>0</manga_chapters>",
    `    <my_read_volumes>0</my_read_volumes>`,
    `    <my_read_chapters>${escapeXml(item.progress || 0)}</my_read_chapters>`,
    `    <my_times_read>${escapeXml(rereadCount)}</my_times_read>`,
    `    <my_rereading>${yesNo(rereadCount)}</my_rereading>`,
    `    <my_score>${escapeXml(scoreOrZero(item.score))}</my_score>`,
    `    <my_status>${legacyStatusText(item.malStatus ?? item.status, false)}</my_status>`,
    `    <my_comments>${safeCdata(item.notes || "")}</my_comments>`,
    `    <my_start_date>${escapeXml(dateOrZero(item.startDate))}</my_start_date>`,
    `    <my_finish_date>${escapeXml(dateOrZero(item.finishDate))}</my_finish_date>`,
    `    <my_tags>${safeCdata(item.notes || "")}</my_tags>`,
    "    <my_priority>Low</my_priority>",
    "    <my_reread_value></my_reread_value>",
    "    <my_storage></my_storage>",
    "    <my_retail_volumes>0</my_retail_volumes>",
    "    <my_discuss>YES</my_discuss>",
    "    <my_sns>default</my_sns>",
    "    <update_on_import>1</update_on_import>",
    "  </manga>"
  ].join("\n");
}

export function buildXML(data, type) {
  const isAnime = type === "ANIME";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<myanimelist>\n`;
  xml += `  <myinfo>\n`;
  xml += `    <user_export_type>${isAnime ? 1 : 2}</user_export_type>\n`;
  xml += `  </myinfo>\n`;

  for (const item of data) {
    if (!item?.idMal) continue;

    xml += isAnime ? `${buildAnimeEntry(item)}\n` : `${buildMangaEntry(item)}\n`;
  }

  xml += `</myanimelist>`;
  return new Blob([xml], { type: "application/xml;charset=utf-8" });
}
