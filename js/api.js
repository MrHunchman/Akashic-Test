import { sleep, unique, normalizeText, buildTitleCandidates } from "./utils.js";

const jikanCache = new Map();

function mediaKey(type) {
  return type === "ANIME" ? "anime" : "manga";
}

function sourceTypeToKitsuKind(type) {
  return type === "ANIME" ? "anime" : "manga";
}

export async function fetchAniList(username, type) {
  const query = `
    query ($username: String, $type: MediaType) {
      MediaListCollection(userName: $username, type: $type) {
        lists {
          entries {
            status
            score(format: POINT_10_DECIMAL)
            progress
            repeat
            notes
            startedAt { year month day }
            completedAt { year month day }
            media {
              idMal
              title {
                romaji
                english
                native
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { username, type }
    })
  });

  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || "AniList request failed.");
  }

  const lists = json?.data?.MediaListCollection?.lists || [];
  const entries = lists.flatMap((list) => list.entries || []);

  return entries.map((e) => {
    const titleCandidates = unique([
      e?.media?.title?.english,
      e?.media?.title?.romaji,
      e?.media?.title?.native
    ]);

    return {
      idMal: e?.media?.idMal || null,
      title: titleCandidates[0] || "Unknown",
      titleCandidates,
      score: Number(e?.score) || 0,
      status: e?.status || "",
      progress: Number(e?.progress) || 0,
      rewatches: Number(e?.repeat) || 0,
      notes: e?.notes || "",
      startDate: formatDateObj(e?.startedAt),
      finishDate: formatDateObj(e?.completedAt),
      source: "ANILIST"
    };
  });
}

export async function fetchMAL(username, type) {
  const listType = type === "ANIME" ? "animelist" : "mangalist";
  let entries = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://myanimelist.net/${listType}/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`
    );

    if (!response.ok) {
      throw new Error("MAL profile not found, private, or blocked.");
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    entries = entries.concat(data);
    offset += 300;
  }

  return entries.map((e) => {
    const title = type === "ANIME" ? e.anime_title : e.manga_title;
    return {
      idMal: type === "ANIME" ? e.anime_id : e.manga_id,
      title: title || "Unknown",
      titleCandidates: unique([title]),
      score: Number(e.score) || 0,
      status: e.status || "",
      progress: type === "ANIME" ? Number(e.num_watched_episodes) || 0 : Number(e.num_read_chapters) || 0,
      rewatches: Number(e.is_rewatching || e.is_rereading ? 1 : 0),
      notes: e.tags || "",
      startDate: e.start_date_string || "",
      finishDate: e.finish_date_string || "",
      source: "MAL"
    };
  });
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
  let nextUrl = `https://kitsu.io/api/edge/library-entries?filter[user_id]=${userId}&filter[kind]=${sourceTypeToKitsuKind(type)}&include=anime,manga,anime.mappings,manga.mappings&page[limit]=500`;
  let entries = [];

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) throw new Error("Kitsu request failed.");

    const data = await response.json();
    const mediaMap = new Map();
    const mappingMap = new Map();

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

    const kind = sourceTypeToKitsuKind(type);

    const parsed = (data.data || []).map((entry) => {
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
        startDate: formatKitsuDate(entry.attributes?.startedAt),
        finishDate: formatKitsuDate(entry.attributes?.finishedAt),
        source: "KITSU"
      };
    });

    entries = entries.concat(parsed);
    nextUrl = data.links?.next || null;
  }

  return entries;
}

export async function resolveMissingMalIds(items, type, enabled = true, onProgress = () => {}) {
  if (!enabled) return items;

  const out = [];
  let done = 0;

  for (const item of items) {
    const next = { ...item };

    if (!next.idMal) {
      next.idMal = await resolveMalIdByTitles(next.titleCandidates || [next.title], type);
      if (!next.idMal) {
        next.idMal = null;
      }
      await sleep(150);
    }

    out.push(next);
    done += 1;

    onProgress({
      done,
      total: items.length,
      matched: out.filter((x) => x.idMal).length,
      unmatched: out.filter((x) => !x.idMal).length
    });
  }

  return out;
}

async function resolveMalIdByTitles(titles, type) {
  const kind = mediaKey(type);
  const cleaned = unique((titles || []).filter(Boolean));

  for (const rawTitle of cleaned) {
    const title = rawTitle.trim();
    if (!title) continue;

    const cacheKey = `${kind}:${normalizeText(title)}`;
    if (jikanCache.has(cacheKey)) {
      const cached = jikanCache.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    const results = await searchJikan(kind, title);
    const best = pickBestJikanMatch(results, title);

    if (best?.mal_id) {
      jikanCache.set(cacheKey, best.mal_id);
      return best.mal_id;
    }

    jikanCache.set(cacheKey, null);
    await sleep(350);
  }

  return null;
}

async function searchJikan(kind, query) {
  const url = `https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&limit=5&sfw=true`;
  const response = await fetch(url);

  if (response.status === 429) {
    throw new Error("Jikan rate limit hit while resolving missing MAL IDs.");
  }

  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  return json?.data || [];
}

function pickBestJikanMatch(results, query) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const q = normalizeText(query);

  let best = null;
  let bestScore = -1;

  for (const item of results) {
    const titles = unique([
      item?.title,
      item?.title_english,
      item?.title_japanese,
      ...(item?.titles || []).map((t) => t?.title),
      ...(item?.title_synonyms || [])
    ]).map(normalizeText);

    let score = 0;

    if (titles.includes(q)) score = 100;
    else if (titles.some((t) => t === q)) score = 100;
    else if (titles.some((t) => t.includes(q) || q.includes(t))) score = 80;
    else if (titles.some((t) => sharedTokenCount(t, q) >= 2)) score = 55;
    else if (titles.some((t) => sharedTokenCount(t, q) >= 1)) score = 25;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 55 ? best : null;
}

function sharedTokenCount(a, b) {
  const setA = new Set(String(a).split(/\s+/).filter(Boolean));
  const setB = new Set(String(b).split(/\s+/).filter(Boolean));
  let count = 0;
  for (const token of setA) {
    if (setB.has(token)) count += 1;
  }
  return count;
}

function formatDateObj(obj) {
  if (!obj || !obj.year) return "";
  const m = String(obj.month || 1).padStart(2, "0");
  const d = String(obj.day || 1).padStart(2, "0");
  return `${obj.year}-${m}-${d}`;
}

function formatKitsuDate(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}
