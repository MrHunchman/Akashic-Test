import { fetchSource } from "./api/index.js";
import { downloadBlob, normalizeStatusToMalCode } from "./utils.js";

const profileModal = document.getElementById("profileModal");
const profileModalBackdrop = document.getElementById("profileModalBackdrop");
const profileModalClose = document.getElementById("profileModalClose");

const profileSourcePlatform = document.getElementById("profileSourcePlatform");
const profileUsername = document.getElementById("profileUsername");
const profileMediaType = document.getElementById("profileMediaType");
const profileGenerateBtn = document.getElementById("profileGenerateBtn");
const profileDownloadBtn = document.getElementById("profileDownloadBtn");
const profileStatusText = document.getElementById("profileStatusText");
const profileCanvas = document.getElementById("profileCanvas");
const profileTotalText = document.getElementById("profileTotalText");
const profileAverageText = document.getElementById("profileAverageText");
const profileHighestText = document.getElementById("profileHighestText");
const profileProgressText = document.getElementById("profileProgressText");
const profileProgressLabel = document.getElementById("profileProgressLabel");
const profileCompletedText = document.getElementById("profileCompletedText");

const mainSourcePlatform = document.getElementById("sourcePlatform");
const mainUsername = document.getElementById("username");
const mainMediaType = document.getElementById("mediaType");

let lastProfileBlob = null;
let lastProfileFilename = "";
let initialized = false;

export function initProfileModule() {
  if (initialized) return;
  initialized = true;

  profileModalBackdrop?.addEventListener("click", () => closeProfileModal());
  profileModalClose?.addEventListener("click", () => closeProfileModal());
  profileGenerateBtn?.addEventListener("click", generateProfileCard);
  profileDownloadBtn?.addEventListener("click", downloadProfileCard);

  [profileSourcePlatform, profileUsername, profileMediaType].forEach((node) => {
    node?.addEventListener("input", resetProfilePreview);
    node?.addEventListener("change", resetProfilePreview);
  });

  resetProfilePreview();
}

export function openProfileModal() {
  syncProfileDefaults();
  profileModal?.classList.remove("hidden");
  profileModal?.classList.add("flex");
  document.title = "Akashic | Profile Generation";
}

export function closeProfileModal({ fromHistory = false, skipHistory = false } = {}) {
  if (!skipHistory && history.state?.modal === "profile" && !fromHistory) {
    history.back();
    return;
  }

  profileModal?.classList.add("hidden");
  profileModal?.classList.remove("flex");
  document.title = "Akashic";
}

export function syncProfileDefaults() {
  if (mainSourcePlatform && profileSourcePlatform) {
    profileSourcePlatform.value = mainSourcePlatform.value;
  }

  if (mainMediaType && profileMediaType) {
    profileMediaType.value = mainMediaType.value;
  }

  if (mainUsername && profileUsername && !profileUsername.value.trim()) {
    profileUsername.value = mainUsername.value.trim();
  }

  resetProfilePreview();
}

function resetProfilePreview() {
  lastProfileBlob = null;
  lastProfileFilename = "";
  if (profileDownloadBtn) profileDownloadBtn.disabled = true;
  if (profileStatusText) profileStatusText.textContent = "Ready to generate a profile card.";
  updateProfileStats(null);
  renderProfilePlaceholder();
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
  return mediaType === "MANGA" ? "Chapters read" : "Episodes watched";
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

function buildProfileSummary(entries, sourcePlatform, mediaType, username) {
  const normalized = (entries || []).map((item) => {
    const score = Number(item.score) || 0;
    const progress = Number(item.progress) || 0;
    const statusCode = normalizeStatusToMalCode(item.status);
    const title = String(item.title || "Unknown").trim();

    return {
      title,
      score,
      progress,
      statusCode,
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

    const progressDiff = (b.progress || 0) - (a.progress || 0);
    if (progressDiff !== 0) return progressDiff;

    return a.title.localeCompare(b.title);
  });

  const highestItem = sortedByScore[0] || null;
  const topEntries = sortedByScore.slice(0, 3);

  return {
    total,
    averageScore: total ? scoreSum / total : 0,
    progressTotal,
    completedCount,
    highestItem,
    topEntries,
    statusCounts,
    username,
    sourcePlatform,
    sourceLabel: getPlatformLabel(sourcePlatform),
    mediaType,
    mediaLabel: getMediaLabel(mediaType),
    progressLabel: getProgressLabel(mediaType),
    progressLabelShort: getProgressLabelShort(mediaType)
  };
}

function updateProfileStats(summary) {
  if (!summary) {
    if (profileTotalText) profileTotalText.textContent = "0";
    if (profileAverageText) profileAverageText.textContent = "0.0";
    if (profileHighestText) profileHighestText.textContent = "0.0";
    if (profileProgressText) profileProgressText.textContent = "0";
    if (profileProgressLabel) profileProgressLabel.textContent = "Episodes";
    if (profileCompletedText) profileCompletedText.textContent = "0";
    return;
  }

  if (profileTotalText) profileTotalText.textContent = String(summary.total);
  if (profileAverageText) profileAverageText.textContent = summary.averageScore.toFixed(1);
  if (profileHighestText) profileHighestText.textContent = summary.highestItem ? summary.highestItem.score.toFixed(1) : "0.0";
  if (profileProgressText) profileProgressText.textContent = String(summary.progressTotal);
  if (profileProgressLabel) profileProgressLabel.textContent = summary.progressLabelShort;
  if (profileCompletedText) profileCompletedText.textContent = String(summary.completedCount);
}

function renderProfilePlaceholder() {
  drawProfileCard(profileCanvas, null);
}

async function generateProfileCard() {
  const sourcePlatform = profileSourcePlatform.value;
  const username = profileUsername.value.trim();
  const mediaType = profileMediaType.value;

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  const oldLabel = profileGenerateBtn.textContent;
  profileGenerateBtn.disabled = true;
  profileGenerateBtn.textContent = "Generating...";
  profileDownloadBtn.disabled = true;
  profileStatusText.textContent = `Fetching ${getPlatformLabel(sourcePlatform)} data...`;

  try {
    const rawData = await fetchSource(sourcePlatform, username, mediaType);
    const summary = buildProfileSummary(rawData, sourcePlatform, mediaType, username);

    lastProfileFilename = buildProfileFilename(username, sourcePlatform, mediaType);
    drawProfileCard(profileCanvas, summary);
    lastProfileBlob = await canvasToBlob(profileCanvas);

    updateProfileStats(summary);
    profileDownloadBtn.disabled = false;

    if (summary.total > 0) {
      profileStatusText.textContent = `Top rated: ${summary.highestItem ? summary.highestItem.title : "Unknown"} · ${summary.total} entries ready.`;
    } else {
      profileStatusText.textContent = "No entries found for that account, but the card is still ready.";
    }
  } catch (error) {
    console.error(error);
    lastProfileBlob = null;
    lastProfileFilename = "";
    updateProfileStats(null);
    renderProfilePlaceholder();
    profileStatusText.textContent = `Error: ${error.message}`;
    profileDownloadBtn.disabled = true;
  } finally {
    profileGenerateBtn.disabled = false;
    profileGenerateBtn.textContent = oldLabel;
  }
}

async function downloadProfileCard() {
  try {
    if (!lastProfileBlob) {
      const blob = await canvasToBlob(profileCanvas);
      if (!blob) throw new Error("Profile image not ready.");
      lastProfileBlob = blob;

      if (!lastProfileFilename) {
        const username = profileUsername.value.trim() || "akashic_profile";
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

function drawProfileCard(canvas, summary) {
  const W = 1400;
  const H = 900;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const hasData = Boolean(summary && summary.total > 0);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#040816");
  bg.addColorStop(1, "#0b1020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawGlow(ctx, 180, 120, 330, "rgba(168, 85, 247, 0.26)");
  drawGlow(ctx, 1260, 140, 330, "rgba(59, 130, 246, 0.22)");
  drawGlow(ctx, 780, 820, 360, "rgba(139, 92, 246, 0.18)");

  drawRoundedRect(ctx, 30, 30, W - 60, H - 60, 42, "rgba(10, 15, 32, 0.90)", "rgba(255,255,255,0.10)");

  drawPill(ctx, 70, 68, 190, 38, "AKASHIC PROFILE", "#8b5cf6");
  drawPill(ctx, W - 290, 68, 220, 38, hasData ? `${summary.total} entries` : "Preview ready", "#22c55e");

  ctx.fillStyle = "#ffffff";
  const name = hasData ? summary.username : "Profile Preview";
  const nameSize = fitTextSize(ctx, name, 900, 58, 34, 800);
  ctx.font = `800 ${nameSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(name, 70, 165);

  ctx.fillStyle = "rgba(226,232,240,0.88)";
  ctx.font = "500 22px Inter, system-ui, sans-serif";
  const subLine = hasData
    ? `${summary.sourceLabel} • ${summary.mediaLabel}`
    : "Generate a shareable profile card from any public account.";
  ctx.fillText(subLine, 70, 206);

  ctx.fillStyle = "rgba(196,181,253,0.92)";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  const topLine = hasData
    ? `Top rated: ${summary.highestItem ? summary.highestItem.title : "Unknown"} · ${summary.highestItem ? summary.highestItem.score.toFixed(1) : "0.0"}`
    : "The card updates instantly after you generate it.";
  ctx.fillText(topLine, 70, 238);

  drawRoundedRect(ctx, 70, 280, 690, 350, 30, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)");
  drawRoundedRect(ctx, 790, 280, 540, 350, 30, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)");
  drawRoundedRect(ctx, 70, 655, 1260, 175, 30, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)");

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Inter, system-ui, sans-serif";
  ctx.fillText("Stats", 98, 322);

  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  ctx.fillText("A fast look at the list behind the card", 98, 346);

  const statLeft = 96;
  const statTop = 372;
  const statW = 298;
  const statH = 100;
  const gapX = 22;
  const gapY = 18;

  drawStatTile(ctx, statLeft, statTop, statW, statH, "Entries", hasData ? String(summary.total) : "0", "#8b5cf6");
  drawStatTile(ctx, statLeft + statW + gapX, statTop, statW, statH, "Avg Score", hasData ? summary.averageScore.toFixed(1) : "0.0", "#22c55e");
  drawStatTile(ctx, statLeft, statTop + statH + gapY, statW, statH, "Highest", hasData && summary.highestItem ? `${summary.highestItem.score.toFixed(1)}` : "0.0", "#38bdf8");
  drawStatTile(ctx, statLeft + statW + gapX, statTop + statH + gapY, statW, statH, summary.progressLabel, hasData ? String(summary.progressTotal) : "0", "#f59e0b");

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Inter, system-ui, sans-serif";
  ctx.fillText("Top entries", 818, 322);

  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  ctx.fillText("Highest rated items pulled from the account", 818, 346);

  if (hasData && summary.topEntries.length) {
    const rowX = 818;
    const rowW = 480;
    const rowH = 82;
    const rowYStart = 372;
    summary.topEntries.forEach((entry, index) => {
      drawEntryRow(ctx, rowX, rowYStart + index * 90, rowW, rowH, index + 1, entry, summary.mediaType);
    });
  } else {
    ctx.fillStyle = "rgba(226,232,240,0.82)";
    ctx.font = "600 20px Inter, system-ui, sans-serif";
    ctx.fillText("No entries yet", 846, 425);
    ctx.fillStyle = "rgba(148,163,184,0.88)";
    ctx.font = "500 15px Inter, system-ui, sans-serif";
    ctx.fillText("Generate a card from a public account to populate this section.", 846, 455);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Inter, system-ui, sans-serif";
  ctx.fillText("Status breakdown", 96, 696);

  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  ctx.fillText("The balance of the account in five simple bars", 96, 720);

  const statusBars = hasData
    ? [
        { label: getProfileStatusLabel(1, summary.mediaType), count: summary.statusCounts[1], color: "#8b5cf6" },
        { label: getProfileStatusLabel(2, summary.mediaType), count: summary.statusCounts[2], color: "#22c55e" },
        { label: getProfileStatusLabel(3, summary.mediaType), count: summary.statusCounts[3], color: "#f59e0b" },
        { label: getProfileStatusLabel(4, summary.mediaType), count: summary.statusCounts[4], color: "#fb7185" },
        { label: getProfileStatusLabel(6, summary.mediaType), count: summary.statusCounts[6], color: "#38bdf8" }
      ]
    : [
        { label: getProfileStatusLabel(1, "ANIME"), count: 0, color: "#8b5cf6" },
        { label: getProfileStatusLabel(2, "ANIME"), count: 0, color: "#22c55e" },
        { label: getProfileStatusLabel(3, "ANIME"), count: 0, color: "#f59e0b" },
        { label: getProfileStatusLabel(4, "ANIME"), count: 0, color: "#fb7185" },
        { label: getProfileStatusLabel(6, "ANIME"), count: 0, color: "#38bdf8" }
      ];

  const barStartY = 748;
  const barW = 1140;
  const barX = 150;

  statusBars.forEach((item, index) => {
    const y = barStartY + index * 23;
    drawStatusBar(ctx, 96, y, barX, barW, item.label, item.count, hasData ? summary.total : 0, item.color);
  });

  ctx.fillStyle = "rgba(148,163,184,0.8)";
  ctx.font = "500 13px Inter, system-ui, sans-serif";
  const foot = hasData
    ? "Generated locally in the browser. No backend, no uploads, no nonsense."
    : "Generate a profile to turn this preview into a real card.";
  ctx.fillText(foot, 70, 866);
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
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPill(ctx, x, y, width, height, text, accent) {
  drawRoundedRect(ctx, x, y, width, height, height / 2, "rgba(255,255,255,0.05)", accent);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 16, y + height / 2 + 1);
  ctx.restore();
}

function drawStatTile(ctx, x, y, w, h, label, value, accent) {
  drawRoundedRect(ctx, x, y, w, h, 24, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
  ctx.save();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 5, h);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText(value, x + 22, y + 38);
  ctx.fillStyle = "rgba(203,213,225,0.78)";
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  ctx.fillText(label, x + 22, y + 66);
  ctx.restore();
}

function drawEntryRow(ctx, x, y, w, h, rank, entry, mediaType) {
  drawRoundedRect(ctx, x, y, w, h, 22, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");

  drawPill(ctx, x + 16, y + 20, 52, 34, String(rank), "#8b5cf6");

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px Inter, system-ui, sans-serif";
  wrapText(ctx, entry.title || "Unknown", x + 84, y + 30, w - 190, 24, 2);

  ctx.fillStyle = "rgba(203,213,225,0.84)";
  ctx.font = "500 13px Inter, system-ui, sans-serif";
  const subtitle = `${entry.statusLabel} • ${entry.progress} ${getProgressLabelShort(mediaType)}`;
  ctx.fillText(subtitle, x + 84, y + 62);

  drawPill(ctx, x + w - 94, y + 20, 72, 34, entry.score.toFixed(1), "#22c55e");
  ctx.restore();
}

function drawStatusBar(ctx, x, y, labelX, barW, label, count, total, color) {
  ctx.save();
  ctx.fillStyle = "rgba(226,232,240,0.95)";
  ctx.font = "600 14px Inter, system-ui, sans-serif";
  ctx.fillText(label, x, y + 13);

  ctx.fillStyle = "rgba(226,232,240,0.7)";
  ctx.textAlign = "right";
  ctx.fillText(String(count), x + labelX + barW, y + 13);
  ctx.textAlign = "left";

  const barX = x + labelX;
  const barY = y - 2;
  const barH = 10;
  drawRoundedRect(ctx, barX, barY, barW, barH, 8, "rgba(255,255,255,0.06)", "rgba(255,255,255,0.05)");

  const fillWidth = total > 0 ? Math.max(8, Math.round((count / total) * barW)) : 0;
  if (fillWidth > 0) {
    drawRoundedRect(ctx, barX, barY, fillWidth, barH, 8, color, color);
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }

  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  for (let i = 0; i < lines.length; i += 1) {
    let drawLine = lines[i];
    if (i === maxLines - 1 && words.length > lines.join(" ").split(/\s+/).length) {
      while (ctx.measureText(`${drawLine}…`).width > maxWidth && drawLine.length > 1) {
        drawLine = drawLine.slice(0, -1);
      }
      drawLine = `${drawLine}…`;
    }
    ctx.fillText(drawLine, x, y + i * lineHeight);
  }
             }
