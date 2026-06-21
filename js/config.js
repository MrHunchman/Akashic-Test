export const STATUS_MAP = {
  CURRENT: 1,
  COMPLETED: 2,
  PAUSED: 3,
  DROPPED: 4,
  PLANNING: 6,
  REPEATING: 1,

  current: 1,
  completed: 2,
  on_hold: 3,
  dropped: 4,
  planned: 6,
  currently_watching: 1,
  plan_to_watch: 6,
  plan_to_read: 6,

  watching: 1,
  reading: 1,
  finished: 2,
  hold: 3,

  1: 1,
  2: 2,
  3: 3,
  4: 4,
  6: 6
};

export const MAL_STATUS_LABELS = {
  1: "Current",
  2: "Completed",
  3: "On Hold",
  4: "Dropped",
  6: "Planning"
};

export const EXPORT_EXTENSIONS = {
  XML: "xml",
  CSV: "csv",
  JSON: "json",
  TXT: "txt",
  DOCX: "docx"
};
