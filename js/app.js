import {
  EXPORT_BASE_LABELS,
  EXPORT_EXTENSIONS,
  TARGET_RECOMMENDATIONS,
  TARGET_RECOMMENDATION_TEXT
} from "./config.js";
import { fetchSource, resolveMissingMalIds } from "./api/index.js";
import { applyScoreRule, normalizeStatusToMalCode, downloadBlob } from "./utils.js";
import { buildXML, buildCSV, buildJSON, buildTXT, buildDOCX } from "./exporters/index.js";

const landingScreen = document.getElementById("landingScreen");
const translatorScreen = document.getElementById("translatorScreen");
const openTranslator = document.getElementById("openTranslator");
const backHomeBtn = document.getElementById("backHomeBtn");

const futureModal = document.getElementById("futureModal");
const futureModalBackdrop = document.getElementById("futureModalBackdrop");
const futureModalClose = document.getElementById("futureModalClose");
const futureModalTitle = document.getElementById("futureModalTitle");
const futureModalText = document.getElementById("futureModalText");

const jikanModal = document.getElementById("jikanModal");
const jikanModalBackdrop = document.getElementById("jikanModalBackdrop");
const jikanProgressText = document.getElementById("jikanProgressText");
const jikanCurrentText = document.getElementById("jikanCurrentText");
const jikanTimerText = document.getElementById("jikanTimerText");

const els = {
  sourcePlatform: document.getElementById("sourcePlatform"),
  targetPlatform: document.getElementById("targetPlatform"),
  username: document.getElementById("username"),
  mediaType: document.getElementById("mediaType"),
  exportFormat: document.getElementById("exportFormat"),
  scoreRule: document.getElementById("scoreRule"),
  fallbackSearch: document.getElementById("fallbackSearch"),
  exportBtn: document.getElementById("exportBtn"),
  loadingState: document.getElementById("loadingState"),
  logSection: document.getElementById("logSection"),
  statsBox: document.getElementById("statsBox"),
  phantomBox: document.getElementById("phantomBox"),
  phantomList: document.getElementById("phantomList"),
  matchProgressBox: document.getElementById("matchProgressBox"),
  matchProgressText: document.getElementById("matchProgressText"),
  matchCurrentText: document.getElementById("matchCurrentText"),
  matchTimerText: document.getElementById("matchTimerText"),
  targetRecommendationText: document.getElementById("targetRecommendationText")
};

let timerInterval = null;
let startedAt = 0;

document.querySelectorAll(".future-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    openFutureModal(btn.dataset.title, btn.dataset.text);
  });
});

openTranslator?.addEventListener("click", () => {
  landingScreen.classList.add("hidden");
  translatorScreen.classList.remove("hidden");
  translatorScreen.scrollIntoView({ behavior: "smooth", block: "start" });
});

backHomeBtn?.addEventListener("click", () => {
  translatorScreen.classList.add("hidden");
  landingScreen.classList.remove("hidden");
  landingScreen.scrollIntoView({ behavior: "smooth", block: "start" });
});

futureModalBackdrop?.addEventListener("click", closeFutureModal);
futureModalClose?.addEventListener("click", closeFutureModal);

jikanModalBackdrop?.addEventListener("click", closeJikanModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFutureModal();
    closeJikanModal();
  }
});

els.exportBtn.addEventListener("click", runTranslator);
els.targetPlatform.addEventListener("change", updateRecommendedFormatLabels);

updateRecommendedFormatLabels();

function openFutureModal(title, text) {
  futureModalTitle.textContent = title || "Coming soon";
  futureModalText.textContent = text || "This feature will be added in a future update.";
  futureModal.classList.remove("hidden");
  futureModal.classList.add("flex");
}

function closeFutureModal() {
  futureModal.classList.add("hidden");
  futureModal.classList.remove("flex");
}

function openJikanModal() {
  jikanModal.classList.remove("hidden");
  jikanModal.classList.add("flex");
}

function closeJikanModal() {
  jikanModal.classList.add("hidden");
  jikanModal.classList.remove("flex");
}

function updateRecommendedFormatLabels() {
  const target = els.targetPlatform.value;
  const recommended = TARGET_RECOMMENDATIONS[target] || "JSON";
  const recommendationText = TARGET_RECOMMENDATION_TEXT[target] || "Recommended export updated.";

  els.targetRecommendationText.textContent = recommendationText;

  for (const option of els.exportFormat.options) {
    const base = EXPORT_BASE_LABELS[option.value] || option.value;
    option.textContent = option.value === recommended
      ? `${base} (recommended)`
      : base;
  }
}

async function runTranslator() {
  const sourcePlatform = els.sourcePlatform.value;
  const targetPlatform = els.targetPlatform.value;
  const username = els.username.value.trim();
  const mediaType = els.mediaType.value;
  const exportFormat = els.exportFormat.value;
  const scoreRule = els.scoreRule.value;
  const fallbackSearch = els.fallbackSearch.checked;

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  setLoading(true);
  clearLog();
  startProgressTimer();

  try {
    const rawData = await fetchSource(sourcePlatform, username, mediaType);

    const standardized = rawData.map((item) => ({
      ...item,
      titleCandidates: item.titleCandidates || [item.title],
      score: Number(item.score) || 0,
      malStatus: normalizeStatusToMalCode(item.status)
    }));

    let resolved = standardized;

    const unresolvedCount = standardized.filter((item) => !item.idMal).length;

    if (fallbackSearch && unresolvedCount > 0) {
      openJikanModal();
      els.matchProgressBox.classList.remove("hidden");

      resolved = await resolveMissingMalIds(standardized, mediaType, {
        enabled: true,
        onProgress: ({ phase, done, total, matched, unmatched }) => {
          if (phase === "start") {
            const msg = `Found ${total} missing entries. Starting fallback lookups...`;
            els.matchProgressText.textContent = msg;
            jikanProgressText.textContent = msg;
          } else if (phase === "batch") {
            const msg = `Resolving missing MAL IDs... ${done}/${total} processed, ${matched} matched, ${unmatched} still unmatched.`;
            els.matchProgressText.textContent = msg;
            jikanProgressText.textContent = msg;
          } else if (phase === "done") {
            const msg = `Finished resolving IDs. ${matched} matched, ${unmatched} still unmatched.`;
            els.matchProgressText.textContent = msg;
            jikanProgressText.textContent = msg;
          }
        },
        onCurrent: ({ title, done, total, matched, unmatched }) => {
          const current = title && title !== "-" ? title : "-";
          const msg = `Current: ${current}`;
          els.matchCurrentText.textContent = msg;
          jikanCurrentText.textContent = msg;

          const timerElapsed = Math.floor((Date.now() - startedAt) / 1000);
          const mins = Math.floor(timerElapsed / 60);
          const secs = timerElapsed % 60;
          const timerMsg = `Elapsed: ${mins}m ${secs}s`;
          els.matchTimerText.textContent = timerMsg;
          jikanTimerText.textContent = timerMsg;
        }
      });
    } else {
      closeJikanModal();
      els.matchProgressBox.classList.add("hidden");
    }

    const translated = resolved.map((item) => ({
      ...item,
      score: applyScoreRule(item.score, scoreRule),
      malStatus: normalizeStatusToMalCode(item.status)
    }));

    const exportable = exportFormat === "XML"
      ? translated.filter((item) => item.idMal)
      : translated;

    const phantoms = translated.filter((item) => !item.idMal);
    const filename = buildFilename(username, sourcePlatform, targetPlatform, exportFormat, mediaType);

    let blob;

    switch (exportFormat) {
      case "XML":
        blob = buildXML(exportable, mediaType);
        break;
      case "CSV":
        blob = buildCSV(translated, mediaType);
        break;
      case "JSON":
        blob = buildJSON(translated, {
          username,
          sourcePlatform,
          targetPlatform,
          mediaType,
          exportFormat
        });
        break;
      case "TXT":
        blob = buildTXT(translated, mediaType);
        break;
      case "DOCX":
        blob = await buildDOCX(translated, mediaType);
        break;
      default:
        throw new Error("Unsupported export format.");
    }

    downloadBlob(blob, filename);

    renderStats({
      total: translated.length,
      exported: exportable.length,
      matched: translated.length - phantoms.length,
      unmatched: phantoms.length,
      exportFormat,
      sourcePlatform,
      targetPlatform
    });

    renderPhantoms(phantoms);
    els.logSection.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    alert(`Error: ${error.message}`);
  } finally {
    stopProgressTimer();
    setLoading(false);
    els.matchProgressBox.classList.add("hidden");
    closeJikanModal();
  }
}

function setLoading(isLoading) {
  els.exportBtn.disabled = isLoading;

  if (isLoading) {
    els.exportBtn.classList.add("hidden");
    els.loadingState.classList.remove("hidden");
    els.loadingState.classList.add("flex");
  } else {
    els.exportBtn.classList.remove("hidden");
    els.loadingState.classList.add("hidden");
    els.loadingState.classList.remove("flex");
  }
}

function clearLog() {
  els.logSection.classList.add("hidden");
  els.statsBox.innerHTML = "";
  els.phantomBox.classList.add("hidden");
  els.phantomList.innerHTML = "";
  els.matchProgressBox.classList.add("hidden");
  els.matchProgressText.textContent = "Starting...";
  els.matchCurrentText.textContent = "Current: -";
  els.matchTimerText.textContent = "Elapsed: 0s";
  jikanProgressText.textContent = "Preparing...";
  jikanCurrentText.textContent = "Current: -";
  jikanTimerText.textContent = "Elapsed: 0s";
}

function startProgressTimer() {
  stopProgressTimer();
  startedAt = Date.now();
  els.matchTimerText.textContent = "Elapsed: 0s";
  jikanTimerText.textContent = "Elapsed: 0s";

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const text = `Elapsed: ${mins}m ${secs}s`;
    els.matchTimerText.textContent = text;
    jikanTimerText.textContent = text;
  }, 1000);
}

function stopProgressTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function renderStats({ total, exported, matched, unmatched, exportFormat, sourcePlatform, targetPlatform }) {
  els.statsBox.innerHTML = `
    <div>Total entries: <strong>${total}</strong></div>
    <div>Matched MAL IDs: <strong>${matched}</strong></div>
    <div>Unmatched: <strong>${unmatched}</strong></div>
    <div>Source: <strong>${sourcePlatform}</strong></div>
    <div>Target: <strong>${targetPlatform}</strong></div>
    <div>Export format: <strong>${exportFormat}</strong></div>
    ${exportFormat === "XML" ? `<div>XML exported entries: <strong>${exported}</strong></div>` : ""}
  `;
}

function renderPhantoms(phantoms) {
  if (!phantoms.length) return;

  els.phantomBox.classList.remove("hidden");
  els.phantomList.innerHTML = "";

  for (const item of phantoms) {
    const li = document.createElement("li");
    li.textContent = item.title;
    els.phantomList.appendChild(li);
  }
}

function buildFilename(username, sourcePlatform, targetPlatform, exportFormat, mediaType) {
  const ext = EXPORT_EXTENSIONS[exportFormat] || exportFormat.toLowerCase();
  return `${username}_${sourcePlatform.toLowerCase()}_to_${targetPlatform.toLowerCase()}_${mediaType.toLowerCase()}.${ext}`;
}
