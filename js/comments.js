const COMMENTS_API_URL = "https://nameakashic-comments.akashicmain.workers.dev/";
const COMMENTS_PER_PAGE = 5;
const COOLDOWN_MS = 60_000;
const STORAGE_KEY_LAST_POST = "akashic_last_comment_time";

const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "wow", emoji: "🔥", label: "Wow" }
];

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
let expandedReplies = new Set();
let openReplyForms = new Set();

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

async function loadComments({ keepPage = true } = {}) {
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
    comments = Array.isArray(data) ? normalizeTree(data) : [];
    comments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (!keepPage) {
      currentPage = 1;
    }

    openReplyForms.clear();
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

  const name = sanitizeText(els.name.value).slice(0, 32) || "Anonymous";
  const message = sanitizeText(els.text.value).slice(0, 240);

  if (!message) {
    setStatus("Write a comment first.");
    return;
  }

  if (getCooldownLeft() > 0) {
    setStatus(`Please wait ${formatCooldown(getCooldownLeft())} before posting again.`);
    return;
  }

  setLoading(true);
  setStatus("Posting comment...");

  try {
    await postJson({
      action: "comment",
      username: name,
      message
    });

    markPosted();
    els.text.value = "";
    currentPage = 1;
    await loadComments({ keepPage: false });
    setStatus("Comment posted.");
    syncCooldownUI();
  } catch (error) {
    console.error(error);
    setStatus(`Could not post comment: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleReplySubmit(parentId, textarea, submitBtn, container) {
  const name = sanitizeText(els.name.value).slice(0, 32) || "Anonymous";
  const message = sanitizeText(textarea.value).slice(0, 240);

  if (!message) {
    setStatus("Write a reply first.");
    return;
  }

  if (getCooldownLeft() > 0) {
    setStatus(`Please wait ${formatCooldown(getCooldownLeft())} before posting again.`);
    return;
  }

  submitBtn.disabled = true;
  setStatus("Posting reply...");

  try {
    await postJson({
      action: "reply",
      parentId,
      username: name,
      message
    });

    markPosted();
    openReplyForms.delete(parentId);
    await loadComments({ keepPage: true });
    setStatus("Reply posted.");
    syncCooldownUI();
  } catch (error) {
    console.error(error);
    setStatus(`Could not post reply: ${error.message}`);
    submitBtn.disabled = false;
  }
}

async function handleReaction(targetId, reaction) {
  if (getCooldownLeft() > 0) {
    setStatus(`Please wait ${formatCooldown(getCooldownLeft())} before posting again.`);
    return;
  }

  try {
    await postJson({
      action: "reaction",
      targetId,
      reaction
    });

    markPosted();
    await loadComments({ keepPage: true });
    setStatus("Reaction added.");
    syncCooldownUI();
  } catch (error) {
    console.error(error);
    setStatus(`Could not add reaction: ${error.message}`);
  }
}

async function postJson(payload) {
  const res = await fetch(COMMENTS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.json().catch(() => ({}));
}

function renderComments() {
  if (!els.list) return;

  const totalPages = getTotalPages();
  if (currentPage > totalPages) {
    currentPage = totalPages || 1;
  }

  const start = (currentPage - 1) * COMMENTS_PER_PAGE;
  const pageItems = comments.slice(start, start + COMMENTS_PER_PAGE);

  els.count.textContent = String(countTree(comments));
  els.pageInfo.textContent = comments.length
    ? `Page ${currentPage} of ${totalPages}`
    : "No comments yet";

  if (els.prev) els.prev.disabled = currentPage <= 1;
  if (els.next) els.next.disabled = currentPage >= totalPages;

  els.list.innerHTML = "";

  if (!pageItems.length) {
    const empty = document.createElement("div");
    empty.className = "comment-empty";
    empty.textContent = "No comments yet. Be the first one to leave a note.";
    els.list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of pageItems) {
    fragment.appendChild(renderNode(item, 0));
  }
  els.list.appendChild(fragment);
}

function renderNode(node, depth = 0) {
  const article = document.createElement("article");
  article.className = `comment-card ${depth > 0 ? "comment-card-reply" : ""}`;

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const name = document.createElement("div");
  name.className = "comment-name";
  name.textContent = node.username || "Anonymous";

  const time = document.createElement("div");
  time.className = "comment-time";
  time.textContent = timeAgo(node.date);

  meta.appendChild(name);
  meta.appendChild(time);

  const message = document.createElement("div");
  message.className = "comment-message";
  message.textContent = node.message || "";

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  const reactionWrap = document.createElement("div");
  reactionWrap.className = "comment-reactions";

  for (const reaction of REACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "comment-reaction";
    button.innerHTML = `<span aria-hidden="true">${reaction.emoji}</span> <span>${Number(node.reactions?.[reaction.key]) || 0}</span>`;
    button.title = reaction.label;
    button.addEventListener("click", () => handleReaction(node.id, reaction.key));
    reactionWrap.appendChild(button);
  }

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "comment-reply-button";
  replyButton.textContent = openReplyForms.has(node.id) ? "Cancel reply" : "Reply";
  replyButton.addEventListener("click", () => {
    if (openReplyForms.has(node.id)) {
      openReplyForms.delete(node.id);
    } else {
      openReplyForms.add(node.id);
    }
    renderComments();
  });

  actions.appendChild(reactionWrap);
  actions.appendChild(replyButton);

  article.appendChild(meta);
  article.appendChild(message);
  article.appendChild(actions);

  if (openReplyForms.has(node.id)) {
    article.appendChild(renderReplyForm(node));
  }

  const replies = Array.isArray(node.replies) ? node.replies : [];
  if (replies.length) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "comment-toggle";
    toggle.textContent = expandedReplies.has(node.id)
      ? `Hide replies (${replies.length})`
      : `Show replies (${replies.length})`;
    toggle.addEventListener("click", () => {
      if (expandedReplies.has(node.id)) {
        expandedReplies.delete(node.id);
      } else {
        expandedReplies.add(node.id);
      }
      renderComments();
    });
    article.appendChild(toggle);
  }

  if (expandedReplies.has(node.id) && replies.length) {
    const replyBox = document.createElement("div");
    replyBox.className = "comment-replies";

    for (const reply of replies) {
      replyBox.appendChild(renderNode(reply, depth + 1));
    }

    article.appendChild(replyBox);
  }

  return article;
}

function renderReplyForm(parent) {
  const wrap = document.createElement("div");
  wrap.className = "comment-reply-form";

  const label = document.createElement("div");
  label.className = "comment-reply-label";
  label.textContent = `Replying as ${sanitizeText(els.name?.value).slice(0, 32) || "Anonymous"}`;

  const textarea = document.createElement("textarea");
  textarea.className = "input input-dark comment-textarea";
  textarea.placeholder = "Write a reply";
  textarea.maxLength = 240;

  const actions = document.createElement("div");
  actions.className = "comment-reply-actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "comment-reply-submit";
  submit.textContent = "Post reply";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "comment-reply-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    openReplyForms.delete(parent.id);
    renderComments();
  });

  actions.appendChild(submit);
  actions.appendChild(cancel);

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(actions);

  wrap.addEventListener("submit", (event) => event.preventDefault());
  submit.addEventListener("click", async () => {
    await handleReplySubmit(parent.id, textarea, submit, wrap);
  });

  return wrap;
}

function normalizeTree(list) {
  return list.map(normalizeNode);
}

function normalizeNode(node) {
  const replies = Array.isArray(node?.replies) ? node.replies.map(normalizeNode) : [];
  const reactions = normalizeReactions(node?.reactions);

  return {
    id: sanitizeText(node?.id) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    username: sanitizeText(node?.username).slice(0, 32) || "Anonymous",
    message: sanitizeText(node?.message).slice(0, 240),
    date: sanitizeText(node?.date) || new Date().toISOString(),
    reactions,
    replies
  };
}

function normalizeReactions(input = {}) {
  return {
    like: Math.max(0, Number(input?.like) || 0),
    love: Math.max(0, Number(input?.love) || 0),
    laugh: Math.max(0, Number(input?.laugh) || 0),
    wow: Math.max(0, Number(input?.wow) || 0)
  };
}

function countTree(nodes) {
  return nodes.reduce((sum, node) => sum + 1 + countTree(node.replies || []), 0);
}

function getTotalPages() {
  return Math.max(1, Math.ceil(comments.length / COMMENTS_PER_PAGE));
}

function setLoading(isLoading) {
  if (els.submit) {
    els.submit.disabled = isLoading || getCooldownLeft() > 0;
    els.submit.style.opacity = isLoading ? "0.7" : "1";
  }
}

function setStatus(text) {
  if (els.status) {
    els.status.textContent = text || "";
  }
}

function getCooldownLeft() {
  const last = Number(localStorage.getItem(STORAGE_KEY_LAST_POST) || 0);
  if (!last) return 0;
  return Math.max(0, COOLDOWN_MS - (Date.now() - last));
}

function markPosted() {
  localStorage.setItem(STORAGE_KEY_LAST_POST, String(Date.now()));
  syncCooldownUI();
  startCooldownTicker();
}

function syncCooldownUI() {
  const left = getCooldownLeft();

  if (left > 0) {
    setStatus(`Cooldown active. You can post again in ${formatCooldown(left)}.`);
    if (els.submit) els.submit.disabled = true;
  } else {
    if (els.submit) els.submit.disabled = false;
  }
}

function startCooldownTicker() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }

  cooldownTimer = setInterval(() => {
    const left = getCooldownLeft();

    if (left <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;

      if (els.submit) {
        els.submit.disabled = false;
      }

      if (els.status && els.status.textContent.startsWith("Cooldown active")) {
        setStatus("");
      }

      return;
    }

    if (els.submit) {
      els.submit.disabled = true;
    }
  }, 1000);
}

function timeAgo(dateString) {
  const ts = new Date(dateString).getTime();
  if (!Number.isFinite(ts)) return "just now";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;

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
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
