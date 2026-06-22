import { fetchAniList } from "./anilist.js";
import { fetchMAL } from "./mal.js";
import { fetchKitsu } from "./kitsu.js";
import { resolveMissingMalIds } from "./jikan.js";

export async function fetchSource(sourcePlatform, username, mediaType) {
  switch (sourcePlatform) {
    case "ANILIST":
      return fetchAniList(username, mediaType);

    case "MAL":
      return fetchMAL(username, mediaType);

    case "KITSU":
      return fetchKitsu(username, mediaType);

    default:
      throw new Error(`Unsupported source platform: ${sourcePlatform}`);
  }
}

export { fetchAniList, fetchMAL, fetchKitsu, resolveMissingMalIds };
