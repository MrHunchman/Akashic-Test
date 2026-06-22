import { unique } from "../utils.js";

function sourceTypeToKitsuKind(type) {
  return type === "ANIME" ? "anime" : "manga";
}

export async function fetchKitsu(username, type) {
  const userRes = await fetch(
    `https://kitsu.io/api/edge/users?filter[slug]=${encodeURIComponent(username)}`
  );
  const userJson = await userRes.json();

  if (!userJson?.data?.length) {
    throw new Error("Kitsu user not found.");
  }

  const userId = userJson.data[0].id;
  const kind = sourceTypeToKitsuKind(type);
  let nextUrl = `https://kitsu.io/api/edge/library-entries?filter[user_id]=${userId}&filter[kind]=${kind}&include=anime,manga,anime.mappings,manga.mappings&page[limit]=500`;
  let entries = [];
  const mediaMap = new Map();
  const mappingMap = new Map();

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) throw new Error("Kitsu request failed.");

    const data = await response.json();

    if (!data || !Array.isArray(data.data)) {
      throw new Error("Kitsu returned an invalid page.");
    }

    (data.included || []).forEach((inc) => {
      if (inc.type === "anime" || inc.type === "manga") {
        mediaMap.set(inc.id, inc);
      }

      if (
        inc.type === "mappings" &&
        String(inc.attributes?.externalSite || "").toLowerCase().includes("myanimelist")
      ) {
        mappingMap.set(inc.id, inc.attributes?.externalId || null);
      }
    });

    const parsed = data.data.map((entry) => {
      const mediaId = entry.relationships?.[kind]?.data?.id;
      const media = mediaMap.get(mediaId);

      let idMal = null;
      const mappingRefs = media?.relationships?.mappings?.data || [];

      for (const ref of mappingRefs) {
        if (mappingMap.has(ref.id)) {
          idMal = mappingMap.get(ref.id);
          break;
        }
      }

      const title = media?.attributes?.canonicalTitle || "Unknown";
      const titleCandidates = unique([
        title,
        media?.attributes?.slug
      ]);

      return {
        idMal,
        title,
        titleCandidates,
        score: (Number(entry.attributes?.ratingTwenty) || 0) / 2,
        status: entry.attributes?.status || "",
        progress: Number(entry.attributes?.progress) || 0,
        rewatches: Number(entry.attributes?.reconsumeCount) || 0,
        notes: entry.attributes?.notes || "",
        startDate: entry.attributes?.startedAt ? String(entry.attributes.startedAt).split("T")[0] : "",
        finishDate: entry.attributes?.finishedAt ? String(entry.attributes.finishedAt).split("T")[0] : "",
        source: "KITSU"
      };
    });

    entries = entries.concat(parsed);
    nextUrl = data?.links?.next || null;
  }

  return entries;
}
