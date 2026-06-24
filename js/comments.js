const COMMENTS_API_URL = "https://nameakashic-comments.akashicmain.workers.dev/";
const COMMENTS_PER_PAGE = 5;
const COOLDOWN_MS = 60_000;
const STORAGE_KEY_LAST_POST = "akashic_last_comment_time";

const els = {
  count: document.getElementById("commentCount"),
  form: document.getElementById("commentForm"),
  name: document.getElementById("commentName"),
  text: document.getElementById("commentText"),
  submit: document.getElementById("commentSubmit"),
  status: document.getElementById("commentStatus"),
  list: document.getElementById("commentList"),
  prev: document.getElementById("commentPrev"),
  next: document.getElementById("commentNext"),
  pageInfo: document.getElementById("commentPageInfo")
};

let comments = [];
let currentPage = 1;
let cooldownTimer = null;

init();

function init() {
  if (!els.form || !els.list) return;

  els.form.addEventListener("submit", handleSubmit);
  els.prev?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderComments();
    }
  });

  els.next?.addEventListener("click", () => {
    const totalPages = getTotalPages();
    if (currentPage < totalPages) {
      currentPage += 1;
      renderComments();
    }
  });

  loadComments();
  syncCooldownUI();
  startCooldownTicker();
}

async function loadComments() {
  setStatus("Loading comments...");
  setLoading(true);

  try {
    const res = await fetch(COMMENTS_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load comments (${res.status})`);
    }

    const data = await res.json();
    comments = Array.isArray(data) ? data : [];

    comments = comments.sort((a, b) => {
      const ta = new Date(a.date || 0).getTime();
      const tb = new Date(b.date || 0).getTime();
      return tb - ta;
    });

    currentPage = 1;
    renderComments();
    setStatus("");
  } catch (error) {
    console.error(error);
    comments = [];
    renderComments();
    setStatus(`Could not load comments: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const name = (els.name.value || "").trim();
  const message = (els.text.value || "").trim();

  if (!name) {
    setStatus("Enter your name first.");
    return;
  }

  if (!message) {
    setStatus("Write a comment first.");
    return;
  }

  const cooldownLeft = getCooldownLeft();
  if (cooldownLeft > 0) {
    setStatus(`Please wait ${formatCooldown(cooldownLeft)} before posting again.`);
    return;
  }

  setLoading(true);
  setStatus("Posting comment...");

  try {
    const res = await fetch(COMMENTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        username: name,
        message
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Failed to post comment (${res.status})`);
    }

    localStorage.setItem(STORAGE_KEY_LAST_POST, String(Date.now()));
    els.text.value = "";
    await loadComments();
    setStatus("Comment posted.");
    syncCooldownUI();
  } catch (error) {
    console.error(error);
    setStatus(`Could not post comment: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function renderComments() {
  if (!els.list) return;

  const totalPages = getTotalPages();
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * COMMENTS_PER_PAGE;
  const pageItems = comments.slice(start, start + COMMENTS_PER_PAGE);

  els.count.textContent = String(comments.length);
  els.pageInfo.textContent = comments.length
    ? `Page ${currentPage} of ${totalPages}`
    : "No comments yet";

  els.prev.disabled = currentPage <= 1;
  els.next.disabled = currentPage >= totalPages;

  els.list.innerHTML = "";

  if (!pageItems.length) {
    const empty = document.createElement("div");
    empty.className = "comment-empty";
    empty.textContent = "No comments yet. Be the first one to leave a note.";
    els.list.appendChild(empty);
    return;
  }

  for (const item of pageItems) {
    const card = document.createElement("article");
    card.className = "comment-card";

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const name = document.createElement("div");
    name.className = "comment-name";
    name.textContent = sanitizeText(item.username || "Anonymous");

    const time = document.createElement("div");
    time.className = "comment-time";
    time.textContent = timeAgo(item.date);

    meta.appendChild(name);
    meta.appendChild(time);

    const message = document.createElement("div");
    message.className = "comment-message";
    message.textContent = sanitizeText(item.message || "");

    card.appendChild(meta);
    card.appendChild(message);
    els.list.appendChild(card);
  }
}

function getTotalPages() {
  return Math.max(1, Math.ceil(comments.length / COMMENTS_PER_PAGE));
}

function setLoading(isLoading) {
  if (els.submit) els.submit.disabled = isLoading;
  if (els.submit) els.submit.style.opacity = isLoading ? "0.7" : "1";
}

function setStatus(text) {
  if (els.status) els.status.textContent = text || "";
}

function getCooldownLeft() {
  const last = Number(localStorage.getItem(STORAGE_KEY_LAST_POST) || 0);
  if (!last) return 0;

  const diff = Date.now() - last;
  return Math.max(0, COOLDOWN_MS - diff);
}

function syncCooldownUI() {
  const left = getCooldownLeft();
  if (left > 0) {
    setStatus(`Cooldown active. You can post again in ${formatCooldown(left)}.`);
    if (els.submit) els.submit.disabled = true;
  } else if (els.submit) {
    els.submit.disabled = false;
  }
}

function startCooldownTicker() {
  if (cooldownTimer) clearInterval(cooldownTimer);

  cooldownTimer = setInterval(() => {
    const left = getCooldownLeft();
    if (left <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      if (els.submit) els.submit.disabled = false;
      if (els.status && els.status.textContent.startsWith("Cooldown active")) {
        setStatus("");
      }
      return;
    }

    if (els.submit) els.submit.disabled = true;
  }, 1000);
}

function timeAgo(dateString) {
  const ts = new Date(dateString).getTime();
  if (!Number.isFinite(ts)) return "just now";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} seconds ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;

  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCooldown(ms) {
  const sec = Math.ceil(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;

  if (min <= 0) return `${rem}s`;
  return `${min}m ${rem}s`;
}

function sanitizeText(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}
