import { unique, formatDate } from "../utils.js";

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
              synonyms
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

  return entries.map((entry) => {
    const titleCandidates = unique([
      entry?.media?.title?.english,
      entry?.media?.title?.romaji,
      entry?.media?.title?.native,
      ...(entry?.media?.synonyms || [])
    ]);

    return {
      idMal: entry?.media?.idMal || null,
      title: titleCandidates[0] || "Unknown",
      titleCandidates,
      score: Number(entry?.score) || 0,
      status: entry?.status || "",
      progress: Number(entry?.progress) || 0,
      rewatches: Number(entry?.repeat) || 0,
      notes: entry?.notes || "",
      startDate: formatDate(entry?.startedAt),
      finishDate: formatDate(entry?.completedAt),
      source: "ANILIST"
    };
  });
}
