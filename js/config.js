export const STATUS_MAP = {
  CURRENT: 1,
  current: 1,
  WATCHING: 1,
  watching: 1,
  REPEATING: 1,
  repeating: 1,
  reading: 1,

  COMPLETED: 2,
  completed: 2,
  FINISHED: 2,
  finished: 2,
  done: 2,

  PAUSED: 3,
  paused: 3,
  ON_HOLD: 3,
  on_hold: 3,
  hold: 3,
  hiatus: 3,

  DROPPED: 4,
  dropped: 4,
  drop: 4,

  PLANNING: 6,
  planning: 6,
  PLANNED: 6,
  planned: 6,
  plan_to_watch: 6,
  plan_to_read: 6
};

export const MAL_STATUS_LABELS = {
  1: "Watching",
  2: "Completed",
  3: "On Hold",
  4: "Dropped",
  6: "Plan to Watch"
};

export const EXPORT_EXTENSIONS = {
  XML: "xml",
  CSV: "csv",
  JSON: "json",
  TXT: "txt",
  DOCX: "docx"
};

export const EXPORT_BASE_LABELS = {
  XML: "XML",
  CSV: "CSV",
  JSON: "JSON",
  TXT: "TXT",
  DOCX: "DOCX"
};

export const TARGET_RECOMMENDATIONS = {
  MAL: "XML",
  ANILIST: "JSON",
  KITSU: "JSON"
};

export const TARGET_RECOMMENDATION_TEXT = {
  MAL: "MyAnimeList works best with XML exports.",
  ANILIST: "AniList backups work best with JSON exports.",
  KITSU: "Kitsu backups work best with JSON exports."
};
