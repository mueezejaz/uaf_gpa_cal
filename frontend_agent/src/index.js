import "./styles.css";
import { marked } from "marked";
import DOMPurify from "dompurify";

/* UAF Agent — rebuilt on the beautifului.dev primitives:
     · Chat        — tabbed panel, reply thread, prompt-bar composer
     · Thinking    — expandable trace (steps, spinner → check, live timing)
     · Streaming   — streamed answer with caret, actions, follow-ups
   The trace keeps running while tokens stream, so the panel never goes
   quiet mid-answer. */

// Use the local uaf-agent backend during development and the deployed Vercel
// backend when this static build is served from GitHub Pages.
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3000/api/agent"
  : "https://uaf-agent.vercel.app/api/agent";

// Chat history lives in sessionStorage: it survives a refresh, and is cleared
// when the tab closes. Every request ships the prior turns so the model has
// conversation context.
const HISTORY_KEY = "uaf-chat-history";
const HISTORY_LIMIT = 60; // stored turns (oldest dropped first)

const STARTERS = [
  "Find my result for 2022-AG-1234",
  "What if I enroll courses graded D to B?",
  "How can I lift my CGPA to 3.5 this year?",
];

const FOLLOW_UPS = [
  "Analyze my CGPA trend",
  "What if I retook a failed course?",
  "Show repeated (excluded) courses",
];

const ICON = {
  sparkle:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>',
  chevron:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  check:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  fail: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  retry:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>',
  up: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>',
  down: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>',
  follow:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
};

/* ------------------------------------------------------------------ utils */

marked.setOptions({ gfm: true, breaks: true });

/** markdown → sanitized html (the model's output is untrusted input) */
function mdToHtml(text) {
  return DOMPurify.sanitize(marked.parse(String(text), { async: false }));
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function extractReg(message) {
  const m = String(message).match(/(\d{4})\s*[-\s]?\s*(ag)\s*[-\s]?\s*(\d{2,5})/i);
  return m ? `${m[1]}-${m[2].toLowerCase()}-${m[3]}` : null;
}

function toolTitle(toolName) {
  if (toolName === "calculate_gpa") return "Calculating GPA";
  return toolName === "fetch_uaf_result" || toolName === "unknown"
    ? "Fetching result"
    : String(toolName).replace(/_/g, " ");
}

function summarize(result) {
  if (result && typeof result === "object") {
    if ("error" in result) return { ok: false, short: String(result.error), detail: "" };
    if ("cgpa" in result) {
      const info = result.student_info || {};
      const sems = Array.isArray(result.semesters) ? result.semesters.length : 0;
      const name = info["Student Full Name"] || info["Name"] || "student";
      return {
        ok: true,
        short: `CGPA ${result.cgpa}`,
        detail: `${name} · ${sems} semester(s) · ${result.total_credit_hours ?? "?"} cr`,
      };
    }
    if (Array.isArray(result.scenarios)) {
      const n = result.scenarios.length;
      const first = result.scenarios[0];
      if (first && first.cgpa) {
        return {
          ok: true,
          short: `CGPA ${first.cgpa.before} → ${first.cgpa.after}`,
          detail: n > 1 ? `${n} scenarios` : first.label || "what-if",
        };
      }
      return { ok: true, short: `${n} scenario${n === 1 ? "" : "s"}`, detail: "solved" };
    }
  }
  const json = JSON.stringify(result);
  return { ok: true, short: json ? json.slice(0, 48) : "ok", detail: "" };
}

/* ------------------------------------------------------------- app shell */

function renderShell(app) {
  app.innerHTML = `
        <div class="bg-glow"></div>
        <div class="grain"></div>

        <div class="stage">
            <section class="chat-card">
                <div class="thread" id="thread">
                    <div class="empty" id="empty">
                        <h1 class="empty-title">Ask about any UAF result</h1>
                        <div class="empty-starters" id="empty-starters">
                            ${STARTERS.map((s) => `<button type="button" class="starter">${ICON.follow}<span>${s}</span></button>`).join("")}
                        </div>
                    </div>
                </div>

                <form class="composer" id="composer" autocomplete="off">
                    <div class="composer-box">
                        <input id="msg-input" class="composer-input" type="text"
                            placeholder="Ask about a UAF result…" aria-label="Chat prompt" />
                        <div class="composer-row">
                            <button type="button" class="send-btn" id="send-btn" aria-label="Send" title="Send" disabled>${ICON.send}</button>
                        </div>
                    </div>
                </form>
            </section>
        </div>
    `;
}

/* ------------------------------------------------------ thinking message */

function createUserMessage(text) {
  const row = el("div", "row user fade-up");
  const bubble = el("div", "bubble");
  bubble.textContent = text;
  row.appendChild(bubble);
  return row;
}

function createAssistantMessage() {
  const row = el("div", "row assistant fade-up");

  /* — Thinking: expandable trace — */
  const thinking = el("div", "thinking");
  const head = el("button", "t-head");
  head.type = "button";
  head.setAttribute("aria-expanded", "false");
  head.innerHTML = `
        <span class="t-spark">${ICON.sparkle}</span>
        <span class="t-label is-live">Thinking</span>
        <span class="t-chevron">${ICON.chevron}</span>`;

  const body = el("div", "t-body");
  const clip = el("div", "t-clip");
  const trace = el("div", "t-trace");
  const rows = el("div", "t-rows");
  trace.appendChild(rows);
  clip.appendChild(trace);
  body.appendChild(clip);
  thinking.append(head, body);

  /* — Streaming text — */
  const answer = el("div", "answer");
  const p = el("div", "answer-text");
  const toks = el("div", "toks");
  const caret = el("span", "caret");
  caret.textContent = "▋";
  p.append(toks, caret);
  const actions = el("div", "answer-actions");
  actions.innerHTML = `
        <button type="button" class="act-btn" data-act="copy" aria-label="Copy">${ICON.copy}</button>
        <button type="button" class="act-btn" data-act="retry" aria-label="Retry">${ICON.retry}</button>
        <button type="button" class="act-btn" data-act="up" aria-label="Good answer" aria-pressed="false">${ICON.up}</button>
        <button type="button" class="act-btn" data-act="down" aria-label="Bad answer" aria-pressed="false">${ICON.down}</button>
        <span class="act-meta" hidden></span>`;
  const follow = el("div", "followups");
  answer.append(p, actions, follow);

  row.append(thinking, answer);

  const ctl = {
    row,
    head,
    label: head.querySelector(".t-label"),
    chevron: head.querySelector(".t-chevron"),
    rows,
    toks,
    caret,
    actions,
    follow,
    text: "",
    error: "",
    caretHidden: false,
    renderQueued: false,
    stepCount: 0,
    autoExpand: false,
    userToggled: null,
  };

  head.addEventListener("click", () => {
    const current = ctl.userToggled === null ? ctl.autoExpand : ctl.userToggled;
    ctl.userToggled = !current;
    paint(ctl);
  });

  return ctl;
}

function paint(ctl) {
  const expanded = ctl.userToggled === null ? ctl.autoExpand : ctl.userToggled;
  ctl.row.querySelector(".thinking").dataset.expanded = expanded ? "true" : "false";
  ctl.head.setAttribute("aria-expanded", expanded ? "true" : "false");
  ctl.chevron.style.transform = expanded ? "rotate(180deg)" : "rotate(0deg)";
}

function setPhase(ctl, label, live) {
  ctl.label.textContent = label;
  ctl.label.classList.toggle("is-live", !!live);
}

function finishPhase(ctl, label) {
  setPhase(ctl, label, false);
  ctl.caretHidden = true;
  ctl.caret.remove();
  ctl.actions.classList.add("is-on");
}

/* --- markdown rendering (throttled to one paint per frame while streaming) */

function placeCaret(ctl) {
  if (ctl.caretHidden || !ctl.caret.isConnected) return;
  const blocks = ctl.toks.querySelectorAll("p, li, h1, h2, h3, h4, pre, blockquote, td, hr");
  const target = blocks.length ? blocks[blocks.length - 1] : ctl.toks;
  if (ctl.caret.parentNode !== target) target.appendChild(ctl.caret);
}

function renderAnswer(ctl) {
  ctl.toks.innerHTML = mdToHtml(ctl.text);
  if (ctl.error) {
    const err = el("div", "answer-error");
    err.textContent = ctl.error;
    ctl.toks.appendChild(err);
  }
  placeCaret(ctl);
}

function scheduleRender(ctl) {
  if (ctl.renderQueued) return;
  ctl.renderQueued = true;
  requestAnimationFrame(() => {
    ctl.renderQueued = false;
    renderAnswer(ctl);
  });
}

function addStep(ctl, primary, secondary, state) {
  const row = el("div", "t-row");
  row.dataset.state = state || "running";
  row.innerHTML = `
        <span class="t-icon">${state === "done" ? ICON.check : '<span class="spinner"></span>'}</span>
        <span class="t-primary"></span>
        <span class="t-secondary"></span>`;
  row.querySelector(".t-primary").textContent = primary;
  row.querySelector(".t-secondary").textContent = secondary || "";
  ctl.rows.appendChild(row);
  ctl.stepCount += 1;
  ctl.autoExpand = true;
  if (ctl.userToggled === null) paint(ctl);
  return row;
}

function stepDone(row, secondary) {
  if (!row) return;
  row.dataset.state = "done";
  row.querySelector(".t-icon").innerHTML = ICON.check;
  if (secondary !== undefined) row.querySelector(".t-secondary").textContent = secondary;
}

function stepFail(row, secondary) {
  if (!row) return;
  row.dataset.state = "fail";
  row.querySelector(".t-icon").innerHTML = ICON.fail;
  if (secondary !== undefined) row.querySelector(".t-secondary").textContent = secondary;
}

function stepCancelled(row, secondary) {
  if (!row) return;
  row.dataset.state = "cancelled";
  row.querySelector(".t-icon").innerHTML = ICON.stop;
  if (secondary !== undefined) row.querySelector(".t-secondary").textContent = secondary;
}

function showFollowUps(ctl) {
  ctl.follow.innerHTML = '<p class="follow-label">Follow-ups</p>';
  const list = el("div", "follow-list");
  FOLLOW_UPS.forEach((text) => {
    const b = el("button", "follow");
    b.type = "button";
    b.innerHTML = ICON.follow;
    b.appendChild(el("span", null, text));
    b.addEventListener("click", () => send(text));
    list.appendChild(b);
  });
  ctl.follow.appendChild(list);
  ctl.follow.classList.add("is-on");
}

function wireActions(ctl) {
  ctl.actions.addEventListener("click", (e) => {
    const btn = e.target.closest(".act-btn");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "copy" && navigator.clipboard) navigator.clipboard.writeText(ctl.text);
    if (act === "retry") send(lastUserMessage);
    if (act === "up" || act === "down") {
      const on = btn.getAttribute("aria-pressed") === "true";
      const twin = ctl.actions.querySelector(`[data-act="${act === "up" ? "down" : "up"}"]`);
      twin.setAttribute("aria-pressed", "false");
      twin.classList.remove("is-on");
      btn.setAttribute("aria-pressed", on ? "false" : "true");
      btn.classList.toggle("is-on", !on);
    }
  });
}

/* ------------------------------------------------------------- transport */

const app = document.getElementById("app");
let busy = false;
let runSeq = 0;
let ticker = null;
let lastUserMessage = "";
let activeCtl = null;
let activeRun = null;
let activeAbort = null;
let history = [];

renderShell(app);

const thread = document.getElementById("thread");
const input = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");
const composer = document.getElementById("composer");

function scrollThread() {
  thread.scrollTop = thread.scrollHeight;
}

function startTicker(run) {
  stopTicker();
  ticker = setInterval(() => {
    // keep the live trace row painting while tokens stream
    if (run.writing && run.writing.dataset.state === "running") {
      run.writing.querySelector(".t-secondary").textContent =
        `${run.chunks} chunk${run.chunks === 1 ? "" : "s"} · ${run.chars} chars`;
    }
  }, 100);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function setSendButtonState() {
  const mode = busy ? "cancel" : "send";
  if (sendBtn.dataset.mode !== mode) {
    sendBtn.dataset.mode = mode;
    sendBtn.innerHTML = busy ? ICON.stop : ICON.send;
    sendBtn.classList.toggle("is-cancel", busy);
    sendBtn.setAttribute("aria-label", busy ? "Cancel request" : "Send");
    sendBtn.title = busy ? "Cancel request" : "Send";
  }
  // While a request is active this remains enabled so it can cancel the fetch.
  sendBtn.disabled = !busy && !input.value.trim();
}

function cancelActiveRequest() {
  if (!busy || !activeAbort) return;
  if (activeCtl) setPhase(activeCtl, "Stopping", true);
  sendBtn.disabled = true;
  activeAbort.abort();
}

/* ---------------------------------------------------------- chat history */

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) =>
        t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string" &&
        t.content.trim(),
    );
  } catch {
    return []; // corrupt JSON, private mode, storage blocked → start fresh
  }
}

function saveHistory() {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  } catch {
    /* quota exceeded / storage blocked — chat still works, just won't persist */
  }
}

function pushTurn(role, content) {
  const text = String(content || "").trim();
  if (!text) return;
  history.push({ role, content: text });
  saveHistory();
}

/** rebuild the thread from stored turns (markdown + revealed actions) */
function restoreHistory() {
  if (!history.length) return;
  document.getElementById("empty")?.remove();
  for (const turn of history) {
    if (turn.role === "user") {
      thread.appendChild(createUserMessage(turn.content));
      continue;
    }
    const ctl = createAssistantMessage();
    wireActions(ctl);
    ctl.text = turn.content;
    renderAnswer(ctl);
    finishPhase(ctl, "Answered");
    ctl.autoExpand = false;
    paint(ctl);
    showFollowUps(ctl);
    thread.appendChild(ctl.row);
  }
  scrollThread();
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!busy) send(input.value);
});

input.addEventListener("input", setSendButtonState);

sendBtn.addEventListener("click", () => {
  if (busy) cancelActiveRequest();
  else send(input.value);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && busy && !e.defaultPrevented) {
    e.preventDefault();
    cancelActiveRequest();
  }
});

document.getElementById("empty-starters").addEventListener("click", (e) => {
  const s = e.target.closest(".starter");
  if (s) send(s.querySelector("span").textContent);
});

// restore a previous session's chat (must run after the listeners above)
history = loadHistory();
restoreHistory();

/* ------------------------------------------------------------------ send */

async function send(raw) {
  const message = String(raw || "").trim();
  if (!message || busy) return;
  input.blur();
  lastUserMessage = message;

  // snapshot of turns *before* this message — sent to the model so it has
  // context; the current message itself goes as `message` (no duplication)
  const priorHistory = history.slice();
  pushTurn("user", message);

  const runId = ++runSeq;
  const isCurrent = () => runId === runSeq;

  document.getElementById("empty")?.remove();
  input.value = "";
  busy = true;
  setSendButtonState();
  input.disabled = false;

  thread.appendChild(createUserMessage(message));
  const ctl = createAssistantMessage();
  wireActions(ctl);
  thread.appendChild(ctl.row);
  activeCtl = ctl;
  scrollThread();

  const run = {
    ctl,
    startedAt: performance.now(),
    firstTokenAt: 0,
    chunks: 0,
    chars: 0,
    tools: 0,
    openStep: null,
    connectStep: null,
    writing: null,
  };
  activeRun = run;
  startTicker(run);

  const reg = extractReg(message);
  const abort = new AbortController();
  activeAbort = abort;

  run.connectStep = addStep(ctl, "Connecting to agent");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: priorHistory }),
      signal: abort.signal,
    });

    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    stepDone(run.connectStep);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim() || !isCurrent()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }

        if (ev.type === "tool-call") {
          run.tools += 1;
          setPhase(ctl, "Running tools", true);
          if (run.openStep) stepDone(run.openStep);
          run.openStep = addStep(ctl, toolTitle(ev.toolName), reg || "…");
        } else if (ev.type === "tool-result") {
          const s = summarize(ev.result);
          stepDone(run.openStep);
          run.openStep = null;
          addStep(ctl, "Result received", s.short, s.ok ? "done" : "fail");
          if (!s.ok) throw new Error(s.short);
        } else if (ev.type === "text-delta") {
          if (!run.firstTokenAt) {
            run.firstTokenAt = performance.now();
            if (run.openStep) stepDone(run.openStep);
            run.openStep = null;
            setPhase(ctl, "Writing answer", true);
            run.writing = addStep(ctl, "Writing answer", "0 chunks");
          }
          run.chunks += 1;
          run.chars += (ev.delta || "").length;
          ctl.text += ev.delta;
          ctl.caret.style.display = "";
          scheduleRender(ctl);
          scrollThread();
        } else if (ev.type === "done") {
          if (!ctl.text && typeof ev.text === "string" && ev.text) {
            ctl.text = ev.text;
          }
          renderAnswer(ctl);
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        }
      }
    }

    if (!isCurrent()) return;

    if (run.openStep) stepDone(run.openStep);
    if (run.writing) {
      stepDone(
        run.writing,
        `${run.chunks} chunk${run.chunks === 1 ? "" : "s"} · ${run.chars} chars`,
      );
      run.writing = null;
    }
    if (!ctl.text) {
      ctl.text = "… (empty reply)";
    }
    renderAnswer(ctl);

    finishPhase(ctl, "Answered");
    ctl.actions.querySelector(".act-meta").hidden = false;
    ctl.actions.querySelector(".act-meta").textContent =
      `${run.tools} tool call${run.tools === 1 ? "" : "s"} · ${run.chunks} chunks`;
    ctl.autoExpand = false;
    if (ctl.userToggled === null) paint(ctl);
    showFollowUps(ctl);
    scrollThread();
  } catch (err) {
    if (!isCurrent()) return;
    const msg = err && err.message ? err.message : String(err);
    if (abort.signal.aborted) {
      const activeStep = run.openStep || run.writing || run.connectStep;
      if (activeStep) stepCancelled(activeStep, "Cancelled");
      finishPhase(ctl, "Stopped");
    } else {
      const failed = ctl.rows.querySelector('.t-row[data-state="running"]') || run.connectStep;
      stepFail(failed, msg.slice(0, 60));
      ctl.error = "⚠ " + msg;
      ctl.row.querySelector(".answer").classList.add("is-error");
      renderAnswer(ctl);
      finishPhase(ctl, "Failed");
    }
  } finally {
    if (isCurrent()) {
      // store exactly one assistant turn per run — what's on screen
      pushTurn("assistant", ctl.text || ctl.error);
      stopTicker();
      busy = false;
      activeCtl = null;
      activeRun = null;
      activeAbort = null;
      setSendButtonState();
    }
  }
}

setSendButtonState();
input.focus();
