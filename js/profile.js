import { fetchSource } from "./api/index.js";
import { downloadBlob, normalizeStatusToMalCode } from "./utils.js";

let initialized = false;
let lastProfileBlob = null;
let lastProfileFilename = "";
let lastProfileSummary = null;

const nodes = {
  profileModal: () => document.getElementById("profileModal"),
  profileModalBackdrop: () => document.getElementById("profileModalBackdrop"),
  profileModalClose: () => document.getElementById("profileModalClose"),

  profileSourcePlatform: () => document.getElementById("profileSourcePlatform"),
  profileUsername: () => document.getElementById("profileUsername"),
  profileMediaType: () => document.getElementById("profileMediaType"),
  profileGenerateBtn: () => document.getElementById("profileGenerateBtn"),
  profilePreviewBtn: () => document.getElementById("profilePreviewBtn"),
  profileDownloadBtn: () => document.getElementById("profileDownloadBtn"),
  profileStatusText: () => document.getElementById("profileStatusText"),
  profileCanvas: () => document.getElementById("profileCanvas"),

  profileTotalText: () => document.getElementById("profileTotalText"),
  profileAverageText: () => document.getElementById("profileAverageText"),
  profileHighestText: () => document.getElementById("profileHighestText"),
  profileProgressText: () => document.getElementById("profileProgressText"),
  profileProgressLabel: () => document.getElementById("profileProgressLabel"),
  profileCompletedText: () => document.getElementById("profileCompletedText"),

  mainSourcePlatform: () => document.getElementById("sourcePlatform"),
  mainUsername: () => document.getElementById("username"),
  mainMediaType: () => document.getElementById("mediaType")
};

const preview = {
  modalId: "profilePreviewModal",
  imageId: "profilePreviewImage",
  metaId: "profilePreviewMeta",
  closeId: "profilePreviewClose",
  downloadId: "profilePreviewDownload"
};

export function initProfileModule() {
  if (initialized) return;
  initialized = true;

  ensurePreviewModal();
  ensureProfileControls();

  nodes.profileModalBackdrop()?.addEventListener("click", () => closeProfileModal());
  nodes.profileModalClose()?.addEventListener("click", () => closeProfileModal());
  nodes.profileGenerateBtn()?.addEventListener("click", generateProfileCard);
  nodes.profileDownloadBtn()?.addEventListener("click", downloadProfileCard);
  nodes.profilePreviewBtn()?.addEventListener("click", openPreviewModal);

  [nodes.profileSourcePlatform(), nodes.profileUsername(), nodes.profileMediaType()].forEach((node) => {
    node?.addEventListener("input", resetProfilePreview);
    node?.addEventListener("change", resetProfilePreview);
  });

  document.getElementById(preview.closeId)?.addEventListener("click", closePreviewModal);
  document.getElementById(preview.downloadId)?.addEventListener("click", () => downloadProfileCard());
  document
    .getElementById(preview.modalId)
    ?.querySelector("[data-preview-backdrop]")
    ?.addEventListener("click", closePreviewModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreviewModal();
  });

  resetProfilePreview();
}

export function syncProfileDefaults() {
  initProfileModule();

  const profileSourcePlatform = nodes.profileSourcePlatform();
  const profileUsername = nodes.profileUsername();
  const profileMediaType = nodes.profileMediaType();

  const source = nodes.mainSourcePlatform()?.value;
  const username = nodes.mainUsername()?.value.trim();
  const mediaType = nodes.mainMediaType()?.value;

  if (profileSourcePlatform && source) profileSourcePlatform.value = source;
  if (profileMediaType && mediaType) profileMediaType.value = mediaType;

  if (profileUsername && username && !profileUsername.value.trim()) {
    profileUsername.value = username;
  }

  resetProfilePreview();
}

export function openProfileModal() {
  initProfileModule();

  const modal = nodes.profileModal();
  if (!modal) return;

  closePreviewModal({ silent: true });
  syncProfileDefaults();

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.title = "Akashic | Profile Generation";
  syncBodyScrollLock();
}

export function closeProfileModal({ fromHistory = false, skipHistory = false } = {}) {
  const modal = nodes.profileModal();
  if (!modal) return;

  if (!skipHistory && history.state?.modal === "profile" && !fromHistory) {
    history.back();
    return;
  }

  closePreviewModal({ silent: true });

  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.title = history.state?.view === "translator" ? "Akashic | Translator" : "Akashic";
  syncBodyScrollLock();
}

function resetProfilePreview() {
  lastProfileBlob = null;
  lastProfileFilename = "";
  lastProfileSummary = null;

  setProfileDownloadEnabled(false);
  setProfileStatus("Ready to generate a profile card.");
  updateProfileStats(null);
  renderProfilePlaceholder();
  syncPreviewModal();
}

function setProfileStatus(text) {
  const status = nodes.profileStatusText();
  if (status) status.textContent = text;
}

function setProfileDownloadEnabled(enabled) {
  const downloadBtn = nodes.profileDownloadBtn();
  if (downloadBtn) downloadBtn.disabled = !enabled;
}

function setProfileGenerateBusy(isBusy) {
  const generateBtn = nodes.profileGenerateBtn();
  if (!generateBtn) return;

  generateBtn.disabled = isBusy;
  generateBtn.textContent = isBusy ? "Generating..." : "Generate Profile Card";
}

function getPlatformLabel(platform) {
  if (platform === "ANILIST") return "AniList";
  if (platform === "KITSU") return "Kitsu";
  return "MyAnimeList";
}

function getMediaLabel(mediaType) {
  return mediaType === "MANGA" ? "Manga" : "Anime";
}

function getProgressLabel(mediaType) {
  return mediaType === "MANGA" ? "Chapters watched" : "Episodes watched";
}

function getProgressLabelShort(mediaType) {
  return mediaType === "MANGA" ? "Chapters" : "Episodes";
}

function getProfileStatusLabel(code, mediaType) {
  const isAnime = mediaType === "ANIME";
  const labels = isAnime
    ? {
        1: "Watching",
        2: "Completed",
        3: "On Hold",
        4: "Dropped",
        6: "Plan to Watch"
      }
    : {
        1: "Reading",
        2: "Completed",
        3: "On Hold",
        4: "Dropped",
        6: "Plan to Read"
      };

  return labels[Number(code)] || (isAnime ? "Plan to Watch" : "Plan to Read");
}

function getTierLabel(level) {
  if (level >= 100) return "LEGEND";
  if (level >= 75) return "PRO";
  if (level >= 40) return "ADVANCED";
  if (level >= 15) return "MEMBER";
  return "NEW";
}

function normalizeSummary(summary) {
  const mediaType = summary?.mediaType || "ANIME";

  return {
    total: Number(summary?.total) || 0,
    averageScore: Number(summary?.averageScore) || 0,
    progressTotal: Number(summary?.progressTotal) || 0,
    completedCount: Number(summary?.completedCount) || 0,
    highestItem: summary?.highestItem || null,
    topEntries: Array.isArray(summary?.topEntries) ? summary.topEntries : [],
    recommendations: Array.isArray(summary?.recommendations) ? summary.recommendations : [],
    statusCounts: {
      1: Number(summary?.statusCounts?.[1]) || 0,
      2: Number(summary?.statusCounts?.[2]) || 0,
      3: Number(summary?.statusCounts?.[3]) || 0,
      4: Number(summary?.statusCounts?.[4]) || 0,
      6: Number(summary?.statusCounts?.[6]) || 0
    },
    username: summary?.username || "Profile Preview",
    sourcePlatform: summary?.sourcePlatform || "ANILIST",
    sourceLabel: summary?.sourceLabel || "AniList",
    mediaType,
    mediaLabel: summary?.mediaLabel || getMediaLabel(mediaType),
    progressLabel: summary?.progressLabel || getProgressLabel(mediaType),
    progressLabelShort: summary?.progressLabelShort || getProgressLabelShort(mediaType),
    level: Number(summary?.level) || 1,
    tier: summary?.tier || getTierLabel(Number(summary?.level) || 1)
  };
}

function buildProfileSummary(entries, sourcePlatform, mediaType, username) {
  const normalized = (entries || []).map((item) => {
    const score = Number(item?.score) || 0;
    const progress = Number(item?.progress) || 0;
    const statusCode = normalizeStatusToMalCode(item?.status);
    const title = String(item?.title || "Unknown").trim();
    const note = String(item?.notes || item?.note || "").trim();

    return {
      title,
      score,
      progress,
      statusCode,
      note,
      statusLabel: getProfileStatusLabel(statusCode, mediaType)
    };
  });

  const total = normalized.length;
  const scoreSum = normalized.reduce((sum, item) => sum + item.score, 0);
  const progressTotal = normalized.reduce((sum, item) => sum + item.progress, 0);
  const completedCount = normalized.filter((item) => item.statusCode === 2).length;

  const statusCounts = {
    1: normalized.filter((item) => item.statusCode === 1).length,
    2: normalized.filter((item) => item.statusCode === 2).length,
    3: normalized.filter((item) => item.statusCode === 3).length,
    4: normalized.filter((item) => item.statusCode === 4).length,
    6: normalized.filter((item) => item.statusCode === 6).length
  };

  const sortedByScore = [...normalized].sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const completedDiff = (b.statusCode === 2 ? 1 : 0) - (a.statusCode === 2 ? 1 : 0);
    if (completedDiff !== 0) return completedDiff;

    const progressDiff = (b.progress || 0) - (a.progress || 0);
    if (progressDiff !== 0) return progressDiff;

    return a.title.localeCompare(b.title);
  });

  const highestItem = sortedByScore[0] || null;
  const topEntries = sortedByScore.slice(0, 3);
  const recommendations = sortedByScore.slice(0, 4);

  const level = Math.max(
    1,
    Math.min(999, Math.round(total / 22 + completedCount / 3 + progressTotal / 120))
  );

  return {
    total,
    averageScore: total ? scoreSum / total : 0,
    progressTotal,
    completedCount,
    highestItem,
    topEntries,
    recommendations,
    statusCounts,
    username,
    sourcePlatform,
    sourceLabel: getPlatformLabel(sourcePlatform),
    mediaType,
    mediaLabel: getMediaLabel(mediaType),
    progressLabel: getProgressLabel(mediaType),
    progressLabelShort: getProgressLabelShort(mediaType),
    level,
    tier: getTierLabel(level)
  };
}

function updateProfileStats(summary) {
  const totalText = nodes.profileTotalText();
  const averageText = nodes.profileAverageText();
  const highestText = nodes.profileHighestText();
  const progressText = nodes.profileProgressText();
  const progressLabel = nodes.profileProgressLabel();
  const completedText = nodes.profileCompletedText();

  if (!summary) {
    if (totalText) totalText.textContent = "0";
    if (averageText) averageText.textContent = "0.0";
    if (highestText) highestText.textContent = "0.0";
    if (progressText) progressText.textContent = "0";
    if (progressLabel) progressLabel.textContent = "Episodes";
    if (completedText) completedText.textContent = "0";
    return;
  }

  if (totalText) totalText.textContent = String(summary.total);
  if (averageText) averageText.textContent = summary.averageScore.toFixed(1);
  if (highestText) highestText.textContent = summary.highestItem ? summary.highestItem.score.toFixed(1) : "0.0";
  if (progressText) progressText.textContent = String(summary.progressTotal);
  if (progressLabel) progressLabel.textContent = summary.progressLabelShort;
  if (completedText) completedText.textContent = String(summary.completedCount);
}

function renderProfilePlaceholder() {
  const canvas = nodes.profileCanvas();
  if (canvas) drawProfileCard(canvas, null);
}

async function generateProfileCard() {
  initProfileModule();

  const profileSourcePlatform = nodes.profileSourcePlatform();
  const profileUsername = nodes.profileUsername();
  const profileMediaType = nodes.profileMediaType();
  const profileCanvas = nodes.profileCanvas();

  if (!profileSourcePlatform || !profileUsername || !profileMediaType || !profileCanvas) {
    alert("Profile UI is not ready.");
    return;
  }

  const sourcePlatform = profileSourcePlatform.value;
  const username = profileUsername.value.trim();
  const mediaType = profileMediaType.value;

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  setProfileGenerateBusy(true);
  setProfileDownloadEnabled(false);
  setProfileStatus(`Fetching ${getPlatformLabel(sourcePlatform)} data...`);

  try {
    const rawData = await fetchSource(sourcePlatform, username, mediaType);
    const summary = buildProfileSummary(rawData, sourcePlatform, mediaType, username);

    lastProfileSummary = summary;
    lastProfileFilename = buildProfileFilename(username, sourcePlatform, mediaType);
    drawProfileCard(profileCanvas, summary);
    lastProfileBlob = await canvasToBlob(profileCanvas);

    updateProfileStats(summary);
    setProfileDownloadEnabled(true);
    syncPreviewModal();

    if (summary.total > 0) {
      setProfileStatus(
        `Top rated: ${summary.highestItem ? summary.highestItem.title : "Unknown"} · ${summary.total} entries ready.`
      );
    } else {
      setProfileStatus("No entries found for that account, but the card is still ready.");
    }
  } catch (error) {
    console.error(error);
    lastProfileBlob = null;
    lastProfileFilename = "";
    lastProfileSummary = null;
    updateProfileStats(null);
    renderProfilePlaceholder();
    setProfileStatus(`Error: ${error.message}`);
    setProfileDownloadEnabled(false);
  } finally {
    setProfileGenerateBusy(false);
  }
}

async function downloadProfileCard() {
  const profileCanvas = nodes.profileCanvas();
  if (!profileCanvas) return;

  try {
    if (!lastProfileBlob) {
      const blob = await canvasToBlob(profileCanvas);
      if (!blob) throw new Error("Profile image not ready.");
      lastProfileBlob = blob;

      if (!lastProfileFilename) {
        const profileUsername = nodes.profileUsername();
        const username = profileUsername?.value.trim() || "akashic_profile";
        lastProfileFilename = `${sanitizeFilenamePart(username)}_profile.png`;
      }
    }

    downloadBlob(lastProfileBlob, lastProfileFilename || "akashic_profile.png");
  } catch (error) {
    alert(`Could not download profile card: ${error.message}`);
  }
}

function sanitizeFilenamePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildProfileFilename(username, sourcePlatform, mediaType) {
  const userPart = sanitizeFilenamePart(username) || "akashic_profile";
  return `${userPart}_${sourcePlatform.toLowerCase()}_${mediaType.toLowerCase()}_profile.png`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create PNG image."));
    }, "image/png");
  });
}

function ensureProfileControls() {
  const grid = nodes.profileGenerateBtn()?.closest(".grid");
  if (!grid) return;

  if (!document.getElementById("profilePreviewBtn")) {
    const btn = document.createElement("button");
    btn.id = "profilePreviewBtn";
    btn.type = "button";
    btn.textContent = "Preview Profile";
    btn.className =
      "rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-4 text-sm font-semibold text-slate-100 transition lift-on-hover disabled:opacity-50 disabled:cursor-not-allowed";
    grid.appendChild(btn);
  }
}

function ensurePreviewModal() {
  if (document.getElementById(preview.modalId)) return;

  const modal = document.createElement("div");
  modal.id = preview.modalId;
  modal.className = "fixed inset-0 hidden items-center justify-center z-50 px-4";

  modal.innerHTML = `
    <div data-preview-backdrop class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
    <div class="relative w-full max-w-5xl rounded-[1.8rem] border border-white/10 bg-[#0a0f1e] shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-5 md:px-7 py-4 border-b border-white/10">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-violet-300/80 mb-1">Preview</p>
          <h3 class="text-xl md:text-2xl font-semibold text-white">Generated profile</h3>
        </div>
        <div class="flex items-center gap-2">
          <button id="${preview.downloadId}" type="button" class="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm text-slate-100 transition">
            Download
          </button>
          <button id="${preview.closeId}" type="button" class="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm text-slate-100 transition">
            Close
          </button>
        </div>
      </div>

      <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div class="p-5 md:p-7 bg-[#090d18]">
          <div class="rounded-[1.4rem] border border-white/10 bg-black/20 p-3 md:p-4">
            <img id="${preview.imageId}" alt="Profile preview" class="w-full h-auto rounded-[1.1rem] block" />
          </div>
        </div>

        <aside class="border-t lg:border-t-0 lg:border-l border-white/10 p-5 md:p-7 bg-white/[0.02]">
          <p class="text-sm text-slate-300 leading-7" id="${preview.metaId}"></p>
          <div class="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 leading-6">
            This preview is generated locally from the canvas. No backend, no uploads.
          </div>
        </aside>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function openPreviewModal() {
  initProfileModule();

  const modal = document.getElementById(preview.modalId);
  if (!modal) return;

  syncPreviewModal();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  syncBodyScrollLock();
}

function closePreviewModal({ silent = false } = {}) {
  const modal = document.getElementById(preview.modalId);
  if (!modal) return;

  modal.classList.add("hidden");
  modal.classList.remove("flex");
  if (!silent) syncBodyScrollLock();
}

function syncPreviewModal() {
  const img = document.getElementById(preview.imageId);
  const meta = document.getElementById(preview.metaId);
  const canvas = nodes.profileCanvas();

  if (img && canvas) {
    try {
      img.src = canvas.toDataURL("image/png");
    } catch {
      img.removeAttribute("src");
    }
  }

  if (meta) {
    const data = normalizeSummary(lastProfileSummary);
    meta.innerHTML = `
      <strong class="text-white">${escapeHtml(data.username)}</strong><br>
      ${escapeHtml(data.sourceLabel)} • ${escapeHtml(data.mediaLabel)}<br>
      Entries: <strong class="text-white">${data.total}</strong><br>
      Avg score: <strong class="text-white">${data.averageScore.toFixed(1)}</strong><br>
      Highest: <strong class="text-white">${data.highestItem ? escapeHtml(data.highestItem.title) : "0.0"}</strong><br>
      Level: <strong class="text-white">${data.level} (${escapeHtml(data.tier)})</strong>
    `;
  }
}

function syncBodyScrollLock() {
  const visibleIds = [
    "profileModal",
    preview.modalId,
    "futureModal",
    "jikanModal"
  ];

  const shouldLock = visibleIds.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });

  document.body.classList.toggle("modal-open", shouldLock);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function drawProfileCard(canvas, summary) {
  const data = normalizeSummary(summary);
  const hasData = data.total > 0;
  const W = 1536;
  const H = 838;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(1, "#11182b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawGlow(ctx, 120, 100, 260, "rgba(124,92,255,0.18)");
  drawGlow(ctx, 1380, 80, 220, "rgba(70,145,255,0.16)");
  drawGlow(ctx, 900, 720, 300, "rgba(255,165,92,0.10)");

  drawRoundedRect(ctx, 16, 16, W - 32, H - 32, 22, "rgba(13, 18, 34, 0.92)", "rgba(255,255,255,0.10)");

  drawLogoBadge(ctx, 36, 34, 86);
  drawHeaderText(ctx, data, W);
  drawLevelRing(ctx, 888, 92, 36, data.level, data.tier);
  drawTotalPill(ctx, W - 184, 52, 122, 44, String(data.total));

  drawRoundedRect(ctx, 40, 150, 1456, 612, 18, "rgba(255,255,255,0.02)", "rgba(255,255,255,0.06)");

  drawSectionHeader(ctx, 58, 184, "Stats", "A fast look at the list behind the card");
  drawSectionHeader(ctx, 770, 184, "Top entries", "Highest rated items pulled from the account");
  drawSectionHeader(ctx, 58, 716, "Featured Completed Entries", "A selection of highly rated titles");

  drawMiniStatCard(ctx, 58, 220, 350, 150, 1, "Entries", hasData ? String(data.total) : "0", "#9d6cff", "density", data);
  drawMiniStatCard(ctx, 426, 220, 350, 150, 2, "Avg Score", hasData ? data.averageScore.toFixed(2) : "0.00", "#5ad17f", "spark", data);
  drawMiniStatCard(ctx, 58, 386, 350, 150, 3, "Highest", hasData && data.highestItem ? data.highestItem.score.toFixed(1) : "0.0", "#5aa8ff", "trophy", data);
  drawMiniStatCard(ctx, 426, 386, 350, 150, 4, data.progressLabel, hasData ? String(data.progressTotal) : "0", "#ff9a4f", "particles", data);

  drawTopEntryList(ctx, 770, 220, 688, 316, data);
  drawFeaturedEntries(ctx, 58, 756, 1400, 76, data);
  drawActivityTab(ctx);
  drawFooterPill(ctx);
}

function drawLogoBadge(ctx, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;

  drawRoundedRect(ctx, x, y, size, size, size / 2, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.14)");
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(228,232,255,0.92)";
  ctx.font = "700 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AKASHIC", cx, cy - 14);
  ctx.fillText("PROFILE", cx, cy + 2);
  ctx.fillText("PRO", cx, cy + 18);

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26);
  ctx.lineTo(cx - 8, cy - 10);
  ctx.lineTo(cx + 8, cy - 10);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = "left";
}

function drawHeaderText(ctx, data, W) {
  ctx.fillStyle = "#ffffff";
  const name = hasDataTitle(data.username);
  const nameSize = fitTextSize(ctx, name, 700, 54, 30, 800);
  ctx.font = `800 ${nameSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(name, 156, 92);

  ctx.fillStyle = "rgba(220,227,244,0.82)";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillText(`${data.sourceLabel} • ${data.mediaLabel}`, 156, 126);

  ctx.fillStyle = "rgba(203,212,232,0.86)";
  ctx.font = "500 15px Inter, system-ui, sans-serif";
  const topLine = hasDataTitle(data.username)
    ? `Top rated: ${data.highestItem ? data.highestItem.title : "Unknown"} • ${data.highestItem ? data.highestItem.score.toFixed(1) : "0.0"}`
    : "Generate a profile card to see the full layout.";
  ctx.fillText(topLine, 156, 154);
}

function hasDataTitle(value) {
  return String(value || "").trim() || "Profile Preview";
}

function drawLevelRing(ctx, cx, cy, radius, level, tier) {
  const pct = Math.max(0, Math.min(1, level / 100));
  const inner = radius - 11;

  ctx.save();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.stroke();

  const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  grad.addColorStop(0, "#68d0ff");
  grad.addColorStop(0.5, "#5a8dff");
  grad.addColorStop(1, "#33d18f");
  ctx.strokeStyle = grad;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, inner, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();

  for (let i = 0; i < 24; i += 1) {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * i) / 24;
    const active = i < Math.ceil(24 * pct);
    const r1 = radius + 2;
    const r2 = radius + 12;
    ctx.strokeStyle = active ? "rgba(125,195,255,0.85)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = active ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Level", cx, cy - 8);

  ctx.font = "800 30px Inter, system-ui, sans-serif";
  ctx.fillText(String(level), cx, cy + 26);

  ctx.fillStyle = "rgba(220,227,244,0.84)";
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  ctx.fillText("Achievement", cx, cy + 44);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawTotalPill(ctx, x, y, w, h, text) {
  drawRoundedRect(ctx, x, y, w, h, h / 2, "rgba(255,255,255,0.10)", "rgba(255,255,255,0.10)");
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 21px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x + w / 2, y + 28);
  ctx.textAlign = "left";
}

function drawSectionHeader(ctx, x, y, title, subtitle) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText(title, x, y);

  ctx.fillStyle = "rgba(164,174,193,0.92)";
  ctx.font = "500 12px Inter, system-ui, sans-serif";
  ctx.fillText(subtitle, x, y + 18);
}

function drawMiniStatCard(ctx, x, y, w, h, chip, label, value, accent, mode, data) {
  drawRoundedRect(ctx, x, y, w, h, 16, "rgba(255,255,255,0.03)", `rgba(${accentToRgb(accent)},0.85)`);

  ctx.fillStyle = hexToRgba(accent, 0.95);
  drawRoundedRect(ctx, x + 10, y + 10, 28, 28, 8, hexToRgba(accent, 0.95), hexToRgba(accent, 0.95));
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(chip), x + 24, y + 29);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText(label, x + 48, y + 30);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 18px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(value), x + w - 18, y + 30);
  ctx.textAlign = "left";

  if (mode === "density") drawBarDensity(ctx, x, y, w, h, data, accent);
  if (mode === "spark") drawSparkline(ctx, x, y, w, h, data, accent);
  if (mode === "trophy") drawTrophyAccent(ctx, x, y, w, h, data, accent);
  if (mode === "particles") drawParticleCloud(ctx, x, y, w, h, data, accent);
}

function drawBarDensity(ctx, x, y, w, h, data, accent) {
  const bars = data.total > 0 ? Math.min(24, Math.max(10, Math.round(data.total / 55))) : 12;
  const baseY = y + h - 16;
  const left = x + 18;
  const right = x + w - 18;
  const width = right - left;
  const gap = 3;
  const barW = Math.max(2, Math.floor((width - gap * (bars - 1)) / bars));

  for (let i = 0; i < bars; i += 1) {
    const t = bars === 1 ? 0 : i / (bars - 1);
    const rand = Math.abs(Math.sin((i + 1) * 12.345));
    const barH = 8 + Math.round(rand * 28 * (0.35 + t * 0.65));
    const alpha = 0.35 + rand * 0.35;
    ctx.fillStyle = hexToRgba(accent, alpha);
    ctx.fillRect(left + i * (barW + gap), baseY - barH, barW, barH);
  }
}

function drawSparkline(ctx, x, y, w, h, data, accent) {
  const values = data.total > 0
    ? data.topEntries.map((e) => e.score).concat([data.averageScore]).slice(0, 6)
    : [1.0, 1.5, 1.2, 1.8, 1.4, 1.6];

  const startX = x + 18;
  const startY = y + h - 18;
  const chartW = w - 36;
  const chartH = 28;

  ctx.strokeStyle = hexToRgba(accent, 0.90);
  ctx.lineWidth = 2.2;
  ctx.beginPath();

  values.forEach((val, idx) => {
    const t = values.length === 1 ? 0 : idx / (values.length - 1);
    const px = startX + t * chartW;
    const normalized = Math.max(0, Math.min(1, val / 10));
    const py = startY - normalized * chartH;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.stroke();

  ctx.fillStyle = hexToRgba(accent, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  values.forEach((val, idx) => {
    const t = values.length === 1 ? 0 : idx / (values.length - 1);
    const px = startX + t * chartW;
    const normalized = Math.max(0, Math.min(1, val / 10));
    const py = startY - normalized * chartH;
    ctx.lineTo(px, py);
  });
  ctx.lineTo(startX + chartW, startY);
  ctx.closePath();
  ctx.fill();
}

function drawTrophyAccent(ctx, x, y, w, h, data) {
  const trophyX = x + 22;
  const trophyY = y + 56;

  ctx.fillStyle = "rgba(118,183,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(trophyX, trophyY - 10);
  ctx.lineTo(trophyX + 28, trophyY - 10);
  ctx.lineTo(trophyX + 24, trophyY + 10);
  ctx.lineTo(trophyX + 32, trophyY + 10);
  ctx.lineTo(trophyX + 32, trophyY + 16);
  ctx.lineTo(trophyX + 18, trophyY + 16);
  ctx.lineTo(trophyX + 18, trophyY + 24);
  ctx.lineTo(trophyX + 10, trophyY + 24);
  ctx.lineTo(trophyX + 10, trophyY + 16);
  ctx.lineTo(trophyX - 4, trophyY + 16);
  ctx.lineTo(trophyX - 4, trophyY + 10);
  ctx.lineTo(trophyX + 4, trophyY + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "500 12px Inter, system-ui, sans-serif";
  const text = data.highestItem ? `Highest Ever: ${truncateText(data.highestItem.title, 26)}` : "Highest Ever: N/A";
  ctx.fillText(text, x + 92, y + 70);
}

function drawParticleCloud(ctx, x, y, w, h, data, accent) {
  const count = data.total > 0 ? Math.min(28, Math.max(12, Math.round(data.progressTotal / 180))) : 14;
  const baseX = x + 34;
  const baseY = y + h - 26;
  for (let i = 0; i < count; i += 1) {
    const px = baseX + ((i * 37) % (w - 70));
    const py = baseY - ((i * 17) % 42);
    const size = 2 + (i % 4);
    ctx.fillStyle = hexToRgba(accent, 0.16 + (i % 5) * 0.08);
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "500 12px Inter, system-ui, sans-serif";
  ctx.fillText(data.progressLabelShort, x + 90, y + 74);
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText("watched", x + 90, y + 96);
}

function drawPosterThumb(ctx, x, y, w, h, title, accent) {
  const hash = hashString(title);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, hashGradientColor(hash, 0));
  grad.addColorStop(1, hashGradientColor(hash, 1));

  drawRoundedRect(ctx, x, y, w, h, 12, grad, "rgba(255,255,255,0.08)");
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(x + w * 0.72, y + h * 0.24, w * 0.20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(x + w * 0.32, y + h * 0.70, w * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(shortTitle(title), x + w / 2, y + h / 2 + 4);
  ctx.textAlign = "left";
}

function drawTopEntryList(ctx, x, y, w, h, data) {
  const entries = data.topEntries.length
    ? data.topEntries
    : [{ title: "No entries yet", score: 0, statusLabel: "Plan to Watch", progress: 0, note: "" }];

  const itemH = 84;
  entries.slice(0, 3).forEach((entry, index) => {
    const itemY = y + index * (itemH + 12);
    drawRoundedRect(
      ctx,
      x,
      itemY,
      w,
      itemH,
      16,
      index === 0 ? "rgba(168,85,247,0.06)" : "rgba(255,255,255,0.03)",
      "rgba(255,255,255,0.08)"
    );

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText(String(index + 1), x + 14, itemY + 29);

    drawPosterThumb(ctx, x + 42, itemY + 12, 54, 60, entry.title, "#7c5cff");

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(truncateText(entry.title, 38), x + 108, itemY + 32);

    ctx.fillStyle = "rgba(191,199,219,0.90)";
    ctx.font = "500 13px Inter, system-ui, sans-serif";
    ctx.fillText(`${entry.statusLabel} • ${entry.progress} ${data.progressLabelShort}`, x + 108, itemY + 54);

    const note = entry.note
      ? `Personal notes`
      : "Personal notes";
    ctx.fillText(note, x + 108, itemY + 70);

    drawRoundedRect(ctx, x + w - 120, itemY + 18, 70, 36, 16, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.09)");
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(entry.score.toFixed(1), x + w - 85, itemY + 42);
    ctx.textAlign = "left";

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x + w - 36, itemY + 18, 1, 48);
    ctx.fillStyle = "rgba(220,227,244,0.84)";
    ctx.font = "500 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Status", x + w - 22, itemY + 56);
    ctx.textAlign = "left";
  });
}

function drawFeaturedEntries(ctx, x, y, w, h, data) {
  const items = (data.recommendations.length ? data.recommendations : data.topEntries).slice(0, 4);
  const cols = 4;
  const gap = 14;
  const cardW = Math.floor((w - gap * (cols - 1)) / cols);
  const cardH = h;

  items.forEach((item, index) => {
    const px = x + index * (cardW + gap);
    drawRoundedRect(ctx, px, y, cardW, cardH, 16, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.08)");

    drawPosterThumb(ctx, px + 10, y + 10, 66, 56, item.title, "#7c5cff");

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(truncateText(item.title, 18), px + 86, y + 26);

    ctx.fillStyle = "rgba(205,214,236,0.86)";
    ctx.font = "500 12px Inter, system-ui, sans-serif";
    ctx.fillText(truncateText(item.note || "Featured completed entry", 22), px + 86, y + 44);

    ctx.fillStyle = "#ffd36e";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.fillText("★", px + 86, y + 64);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(item.score.toFixed(1), px + 102, y + 64);
  });
}

function drawActivityTab(ctx) {
  drawRoundedRect(ctx, 10, 322, 36, 176, 14, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.07)");
  ctx.save();
  ctx.translate(28, 410);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "rgba(230,235,248,0.82)";
  ctx.font = "500 13px Inter, system-ui, sans-serif";
  ctx.fillText("Activity Feed", -42, 0);
  ctx.restore();
}

function drawFooterPill(ctx) {
  drawRoundedRect(ctx, 540, 798, 456, 24, 12, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)");
  ctx.fillStyle = "rgba(205,213,226,0.86)";
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  ctx.fillText("Generated on demand via browser. No server-side storage, no nonsense.", 562, 814);
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();
}

function fitTextSize(ctx, text, maxWidth, maxSize, minSize, weight, family = "Inter, system-ui, sans-serif") {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function shortTitle(value) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hashGradientColor(hash, index) {
  const palette = [
    ["#25324d", "#344663"],
    ["#3d294d", "#664084"],
    ["#1e394f", "#295c7d"],
    ["#4d2a2a", "#7b4747"],
    ["#253f36", "#356f61"]
  ];

  const pair = palette[(hash + index) % palette.length];
  return pair[index % 2];
}

function hexToRgba(hex, alpha) {
  const c = String(hex || "").replace("#", "");
  const num = c.length === 3
    ? c.split("").map((ch) => ch + ch).join("")
    : c.padEnd(6, "0").slice(0, 6);

  const r = parseInt(num.slice(0, 2), 16) || 255;
  const g = parseInt(num.slice(2, 4), 16) || 255;
  const b = parseInt(num.slice(4, 6), 16) || 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function accentToRgb(hex) {
  const c = String(hex || "").replace("#", "");
  const num = c.length === 3
    ? c.split("").map((ch) => ch + ch).join("")
    : c.padEnd(6, "0").slice(0, 6);

  const r = parseInt(num.slice(0, 2), 16) || 255;
  const g = parseInt(num.slice(2, 4), 16) || 255;
  const b = parseInt(num.slice(4, 6), 16) || 255;

  return `${r}, ${g}, ${b}`;
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

initProfileModule();
