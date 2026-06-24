const COMMENTS_API_URL = "https://nameakashic-comments.akashicmain.workers.dev/";
const COMMENTS_PER_PAGE = 5;
const COOLDOWN_MS = 60_000;

const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "wow", emoji: "🔥", label: "Wow" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "angry", emoji: "👎", label: "Angry" }
];

const STORAGE_KEY_LAST_POST = "akashic_last_comment_time";
const STORAGE_KEY_LAST_NAME = "akashic_last_comment_name";
const STORAGE_KEY_REACTION_STATE = "akashic_comment_reactions";
const STORAGE_KEY_EDIT_TOKENS = "akashic_comment_edit_tokens";

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
let editingId = null;
let openReplyForms = new Set();
let expandedReplies = new Set();
let openReactionTargetId = null;

let reactionState = loadJson(STORAGE_KEY_REACTION_STATE, {});
let editTokens = loadJson(STORAGE_KEY_EDIT_TOKENS, {});

init();

function init() {
  if (!els.form || !els.list) return;

  initNameField();

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

  document.addEventListener("click", (event) => {
    const shell = event.target.closest?.(".comment-reaction-trigger");
    if (!shell && openReactionTargetId) {
      openReactionTargetId = null;
      renderComments();
    }
  });
}

function initNameField() {
  const savedName = getStoredName();
  if (els.name && !els.name.value.trim() && savedName) {
    els.name.value = savedName;
  }

  els.name?.addEventListener("input", () => {
    saveStoredName(els.name.value);
  });
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

    if (!keepPage) {
      currentPage = 1;
    }

    openReplyForms.clear();
    editingId = null;
    openReactionTargetId = null;

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

  const name = sanitizeText(els.name?.value || getStoredName() || "").slice(0, 32);
  const message = sanitizeText(els.text?.value || "").slice(0, 240);

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
    const result = await postJson({
      action: "comment",
      username: name || "Anonymous",
      adminKey: name || "",
      message
    });

    if (result?.comment?.id && result?.comment?.editToken) {
      storeEditToken(result.comment.id, result.comment.editToken);
    }

    markPosted();
    saveStoredName(name);

    if (els.text) els.text.value = "";
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

async function handleReplySubmit(parentId, nameInput, textarea, submitBtn) {
  const name = sanitizeText(nameInput?.value || els.name?.value || getStoredName() || "").slice(0, 32);
  const message = sanitizeText(textarea.value || "").slice(0, 240);

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
    const result = await postJson({
      action: "reply",
      parentId,
      username: name || "Anonymous",
      adminKey: name || "",
      message
    });

    if (result?.comment?.id && result?.comment?.editToken) {
      storeEditToken(result.comment.id, result.comment.editToken);
    }

    markPosted();
    saveStoredName(name);

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

async function handleEditSubmit(targetId, textarea, saveBtn) {
  const message = sanitizeText(textarea.value || "").slice(0, 240);

  if (!message) {
    setStatus("Write something before saving.");
    return;
  }

  const editToken = getEditToken(targetId);
  if (!editToken) {
    setStatus("You do not have permission to edit this comment.");
    return;
  }

  saveBtn.disabled = true;
  setStatus("Saving edit...");

  try {
    await postJson({
      action: "edit",
      targetId,
      message,
      editToken,
      adminKey: sanitizeText(els.name?.value || getStoredName() || "")
    });

    editingId = null;
    await loadComments({ keepPage: true });
    setStatus("Comment updated.");
  } catch (error) {
    console.error(error);
    setStatus(`Could not edit comment: ${error.message}`);
    saveBtn.disabled = false;
  }
}

async function handleDelete(targetId) {
  const editToken = getEditToken(targetId);
  if (!editToken) {
    setStatus("You do not have permission to delete this comment.");
    return;
  }

  if (!confirm("Delete this comment?")) return;

  setStatus("Deleting...");
  try {
    await postJson({
      action: "delete",
      targetId,
      editToken,
      adminKey: sanitizeText(els.name?.value || getStoredName() || "")
    });

    removeEditToken(targetId);
    editingId = null;
    openReplyForms.delete(targetId);
    expandedReplies.delete(targetId);

    await loadComments({ keepPage: true });
    setStatus("Comment deleted.");
  } catch (error) {
    console.error(error);
    setStatus(`Could not delete comment: ${error.message}`);
  }
}

async function handleReaction(targetId, chosenReaction) {
  const current = getLocalReaction(targetId);
  const next = current === chosenReaction ? null : chosenReaction;

  try {
    await postJson({
      action: "reaction",
      targetId,
      reaction: next,
      previousReaction: current
    });

    if (next) {
      setLocalReaction(targetId, next);
    } else {
      clearLocalReaction(targetId);
    }

    openReactionTargetId = null;
    await loadComments({ keepPage: true });
    setStatus("Reaction updated.");
  } catch (error) {
    console.error(error);
    setStatus(`Could not update reaction: ${error.message}`);
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

  const visibleRoots = getVisibleRoots();
  const totalPages = getTotalPages(visibleRoots);

  if (currentPage > totalPages) {
    currentPage = totalPages || 1;
  }

  const start = (currentPage - 1) * COMMENTS_PER_PAGE;
  const pageItems = visibleRoots.slice(start, start + COMMENTS_PER_PAGE);

  els.count.textContent = String(visibleRoots.length);
  els.pageInfo.textContent = visibleRoots.length
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
    const node = renderNode(item, 0);
    if (node) fragment.appendChild(node);
  }
  els.list.appendChild(fragment);
}

function renderNode(node, depth = 0) {
  if (!node || node.hidden || node.deleted) {
    return null;
  }

  const article = document.createElement("article");
  article.className = `comment-card ${depth > 0 ? "comment-card-reply" : ""}`;
  article.style.position = "relative";
  article.style.paddingRight = "132px";

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const left = document.createElement("div");
  left.className = "comment-name";

  const name = document.createElement("span");
  name.textContent = node.username || "Anonymous";
  left.appendChild(name);

  if (node.owner) {
    const badge = document.createElement("span");
    badge.className = "owner-badge";
    badge.textContent = "OWNER";
    left.appendChild(badge);
  }

  const time = document.createElement("div");
  time.className = "comment-time";
  time.textContent = timeAgo(node.updatedAt || node.date);

  meta.appendChild(left);
  meta.appendChild(time);

  const actions = document.createElement("div");
  actions.className = "comment-actions comment-actions-floating";
  actions.style.position = "absolute";
  actions.style.top = "0.75rem";
  actions.style.right = "0.75rem";
  actions.style.display = "flex";
  actions.style.gap = "0.35rem";
  actions.style.alignItems = "center";
  actions.style.zIndex = "2";
  actions.style.flexWrap = "nowrap";

  const reactionShell = document.createElement("div");
  reactionShell.className = "comment-reaction-trigger";
  reactionShell.style.position = "relative";
  if (openReactionTargetId === node.id) reactionShell.classList.add("is-open");

  const reactionButton = document.createElement("button");
  reactionButton.type = "button";
  reactionButton.className = "comment-reply-button";
  reactionButton.textContent = "React";
  reactionButton.style.borderRadius = "999px";
  reactionButton.style.padding = "0.36rem 0.72rem";
  reactionButton.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px #242a36";

  let longPressTimer = null;
  let longPressUsed = false;

  const openPicker = () => {
    openReactionTargetId = node.id;
    renderComments();
  };

  reactionButton.addEventListener("pointerdown", () => {
    longPressUsed = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressUsed = true;
      openPicker();
    }, 420);
  });

  reactionButton.addEventListener("pointerup", () => {
    clearTimeout(longPressTimer);
  });

  reactionButton.addEventListener("pointerleave", () => {
    clearTimeout(longPressTimer);
  });

  reactionButton.addEventListener("pointercancel", () => {
    clearTimeout(longPressTimer);
  });

  reactionButton.addEventListener("click", (event) => {
    event.preventDefault();
    clearTimeout(longPressTimer);
    if (!longPressUsed) {
      openPicker();
    }
  });

  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.style.display = "flex";
  picker.style.gap = "2px";
  picker.style.alignItems = "center";
  picker.style.padding = "6px";
  picker.style.borderRadius = "999px";
  picker.style.border = "1px solid #242a36";
  picker.style.background = "#0b0f16";
  picker.style.boxShadow = "0 14px 32px rgba(0, 0, 0, 0.38)";
  picker.style.opacity = "0";
  picker.style.pointerEvents = "none";
  picker.style.transform = "translateY(8px)";
  picker.style.transition = "opacity 0.16s ease, transform 0.16s ease";
  picker.style.position = "absolute";
  picker.style.left = "0";
  picker.style.bottom = "calc(100% + 10px)";
  picker.style.zIndex = "10";

  if (openReactionTargetId === node.id) {
    picker.style.opacity = "1";
    picker.style.pointerEvents = "auto";
    picker.style.transform = "translateY(0)";
  }

  for (const reaction of REACTIONS) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "reaction-option";
    option.style.border = "none";
    option.style.background = "transparent";
    option.style.padding = "4px 6px";
    option.style.fontSize = "1.08rem";
    option.style.lineHeight = "1";
    option.style.cursor = "pointer";

    if (getLocalReaction(node.id) === reaction.key) {
      option.classList.add("active");
      option.style.outline = "2px solid rgba(139, 92, 246, 0.45)";
      option.style.borderRadius = "999px";
    }

    option.textContent = reaction.emoji;
    option.title = reaction.label;
    option.addEventListener("click", () => handleReaction(node.id, reaction.key));
    picker.appendChild(option);
  }

  reactionShell.appendChild(reactionButton);
  reactionShell.appendChild(picker);
  actions.appendChild(reactionShell);

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "comment-reply-button";
  replyButton.textContent = openReplyForms.has(node.id) ? "Cancel" : "Reply";
  replyButton.style.borderRadius = "999px";
  replyButton.style.padding = "0.36rem 0.72rem";
  replyButton.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px #242a36";
  replyButton.addEventListener("click", () => {
    if (openReplyForms.has(node.id)) {
      openReplyForms.delete(node.id);
    } else {
      openReplyForms.add(node.id);
    }
    renderComments();
  });
  actions.appendChild(replyButton);

  if (canManageNode(node)) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "comment-edit-button";
    editButton.textContent = "Edit";
    editButton.style.borderRadius = "999px";
    editButton.style.padding = "0.36rem 0.72rem";
    editButton.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px #242a36";
    editButton.addEventListener("click", () => {
      editingId = editingId === node.id ? null : node.id;
      renderComments();
    });
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "comment-delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.style.borderRadius = "999px";
    deleteButton.style.padding = "0.36rem 0.72rem";
    deleteButton.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px #242a36";
    deleteButton.addEventListener("click", () => handleDelete(node.id));
    actions.appendChild(deleteButton);
  }

  const message = document.createElement("div");
  message.className = "comment-message";
  message.textContent = node.message || "";

  article.appendChild(meta);
  article.appendChild(actions);
  article.appendChild(message);

  if (node.editedAt) {
    const edited = document.createElement("div");
    edited.className = "comment-time mt-1";
    edited.textContent = "edited";
    article.appendChild(edited);
  }

  const reactionSummary = renderReactionSummary(node);
  if (reactionSummary) {
    article.appendChild(reactionSummary);
  }

  if (editingId === node.id) {
    article.appendChild(renderEditForm(node));
  }

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
      const child = renderNode(reply, depth + 1);
      if (child) replyBox.appendChild(child);
    }

    article.appendChild(replyBox);
  }

  return article;
}

function renderReactionSummary(node) {
  const activeReactions = REACTIONS
    .map((reaction) => ({
      ...reaction,
      count: Math.max(0, Number(node.reactions?.[reaction.key]) || 0)
    }))
    .filter((reaction) => reaction.count > 0);

  if (!activeReactions.length) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "comment-reaction-summary comment-reaction-summary-active";
  wrap.style.display = "flex";
  wrap.style.flexWrap = "nowrap";
  wrap.style.alignItems = "center";
  wrap.style.marginTop = "0.6rem";
  wrap.style.opacity = "0.92";

  activeReactions.forEach((reaction, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "comment-pill comment-reaction-badge";
    pill.style.display = "inline-flex";
    pill.style.alignItems = "center";
    pill.style.gap = "4px";
    pill.style.borderRadius = "999px";
    pill.style.padding = "0.33rem 0.58rem";
    pill.style.lineHeight = "1";
    pill.style.fontSize = "0.78rem";
    pill.style.marginLeft = index > 0 ? "-8px" : "0";
    pill.style.position = "relative";
    pill.style.zIndex = String(activeReactions.length - index);
    pill.style.boxShadow = "0 0 0 1px #242a36";

    pill.textContent = `${reaction.emoji} ${reaction.count}`;
    pill.title = reaction.label;
    pill.addEventListener("click", () => handleReaction(node.id, reaction.key));
    wrap.appendChild(pill);
  });

  return wrap;
}

function renderReplyForm(parent) {
  const wrap = document.createElement("div");
  wrap.className = "comment-reply-form";

  const label = document.createElement("div");
  label.className = "comment-reply-label";
  label.textContent = "Write a reply";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "input input-dark max-w-[220px]";
  nameInput.placeholder = "Name";
  nameInput.maxLength = 32;
  nameInput.value = sanitizeText(els.name?.value || getStoredName() || "");

  const textarea = document.createElement("textarea");
  textarea.className = "input input-dark comment-textarea";
  textarea.placeholder = "Write a reply...";
  textarea.maxLength = 240;

  const actions = document.createElement("div");
  actions.className = "comment-reply-actions";

  const submit = document.createElement("button");
  submit.type = "button";
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

  submit.addEventListener("click", async () => {
    await handleReplySubmit(parent.id, nameInput, textarea, submit);
  });

  actions.appendChild(submit);
  actions.appendChild(cancel);

  wrap.appendChild(label);
  wrap.appendChild(nameInput);
  wrap.appendChild(textarea);
  wrap.appendChild(actions);

  return wrap;
}

function renderEditForm(node) {
  const wrap = document.createElement("div");
  wrap.className = "comment-edit-form";

  const label = document.createElement("div");
  label.className = "comment-edit-label";
  label.textContent = "Edit comment";

  const textarea = document.createElement("textarea");
  textarea.className = "input input-dark comment-textarea";
  textarea.maxLength = 240;
  textarea.value = node.message || "";

  const actions = document.createElement("div");
  actions.className = "comment-edit-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "comment-edit-save";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "comment-edit-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    editingId = null;
    renderComments();
  });

  save.addEventListener("click", async () => {
    await handleEditSubmit(node.id, textarea, save);
  });

  actions.appendChild(save);
  actions.appendChild(cancel);

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(actions);

  return wrap;
}

function canManageNode(node) {
  return Boolean(getEditToken(node.id));
}

function getVisibleRoots() {
  return comments.map(pruneTree).filter(Boolean);
}

function getTotalPages(list = getVisibleRoots()) {
  return Math.max(1, Math.ceil(list.length / COMMENTS_PER_PAGE));
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
  } else if (els.submit) {
    els.submit.disabled = false;
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
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTree(list) {
  return list
    .map(normalizeNode)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function normalizeNode(node) {
  const replies = Array.isArray(node?.replies) ? node.replies.map(normalizeNode) : [];

  return {
    id: sanitizeText(node?.id) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    username: sanitizeText(node?.username).slice(0, 32) || "Anonymous",
    message: sanitizeText(node?.message).slice(0, 240),
    date: sanitizeText(node?.date) || new Date().toISOString(),
    updatedAt: sanitizeText(node?.updatedAt) || "",
    editedAt: sanitizeText(node?.editedAt) || "",
    owner: Boolean(node?.owner),
    hidden: Boolean(node?.hidden),
    deleted: Boolean(node?.deleted),
    reactions: normalizeReactions(node?.reactions),
    replies
  };
}

function pruneTree(node) {
  if (!node || node.hidden || node.deleted) return null;

  const replies = Array.isArray(node.replies)
    ? node.replies.map(pruneTree).filter(Boolean)
    : [];

  return {
    ...node,
    replies
  };
}

function normalizeReactions(input = {}) {
  return {
    like: Math.max(0, Number(input?.like) || 0),
    love: Math.max(0, Number(input?.love) || 0),
    laugh: Math.max(0, Number(input?.laugh) || 0),
    wow: Math.max(0, Number(input?.wow) || 0),
    sad: Math.max(0, Number(input?.sad) || 0),
    angry: Math.max(0, Number(input?.angry) || 0)
  };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getStoredName() {
  return sanitizeText(localStorage.getItem(STORAGE_KEY_LAST_NAME) || "");
}

function saveStoredName(value) {
  const clean = sanitizeText(value || "").slice(0, 32);
  if (clean) {
    localStorage.setItem(STORAGE_KEY_LAST_NAME, clean);
  }
}

function getLocalReaction(targetId) {
  return reactionState[targetId] || null;
}

function setLocalReaction(targetId, reaction) {
  reactionState[targetId] = reaction;
  saveJson(STORAGE_KEY_REACTION_STATE, reactionState);
}

function clearLocalReaction(targetId) {
  delete reactionState[targetId];
  saveJson(STORAGE_KEY_REACTION_STATE, reactionState);
}

function getEditToken(id) {
  return editTokens[id] || "";
}

function storeEditToken(id, token) {
  if (!id || !token) return;
  editTokens[id] = token;
  saveJson(STORAGE_KEY_EDIT_TOKENS, editTokens);
}

function removeEditToken(id) {
  if (!id) return;
  delete editTokens[id];
  saveJson(STORAGE_KEY_EDIT_TOKENS, editTokens);
}
