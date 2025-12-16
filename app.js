const UNIT_FILES = [
  ["Endocrine", "data/endocrine.jsonl"],
  ["Blood", "data/blood.jsonl"],
  ["Heart", "data/heart.jsonl"],
  ["Blood Vessels", "data/vessels.jsonl"],
  ["Lymphatic & Immune", "data/immune.jsonl"],
  ["Urinary", "data/urinary.jsonl"],
  ["Digestive", "data/digestive.jsonl"],
  ["Reproductive", "data/reproductive.jsonl"],
  ["Nervous", "data/nervous.jsonl"],
];

const el = (id) => document.getElementById(id);

const state = {
  bankByUnit: new Map(),
  sessionPool: [],
  idx: 0,
  score: { correct: 0, total: 0 },
  byUnit: new Map(),
  wrongCounts: new Map(),
  timer: null,
  timeLeft: 0,
  timerSec: 0,
  mode: "mixed",
  current: null,
};

function buildUnitCheckboxes() {
  const wrap = el("unitList");
  wrap.innerHTML = "";
  UNIT_FILES.forEach(([unit]) => {
    const label = document.createElement("label");
    label.className = "pill";
    label.innerHTML = `<input type="checkbox" data-unit="${unit}" checked /> ${unit}`;
    wrap.appendChild(label);
  });
}

function selectedUnits() {
  return Array.from(document.querySelectorAll('#unitList input[type="checkbox"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.unit);
}

function setAllUnits(val) {
  Array.from(document.querySelectorAll('#unitList input[type="checkbox"]'))
    .forEach(cb => cb.checked = val);
}

async function fetchJsonl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const text = await res.text();
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initStats(units) {
  state.byUnit.clear();
  units.forEach(u => state.byUnit.set(u, { correct: 0, total: 0 }));
  state.wrongCounts.clear();
}

function scoreUnit(unit, correct) {
  const obj = state.byUnit.get(unit) || { correct: 0, total: 0 };
  obj.total += 1;
  if (correct) obj.correct += 1;
  state.byUnit.set(unit, obj);
}

function countWrong(qid) {
  state.wrongCounts.set(qid, (state.wrongCounts.get(qid) || 0) + 1);
}

function startTimer() {
  stopTimer();
  if (!state.timerSec || state.timerSec <= 0) return;

  state.timeLeft = state.timerSec;
  el("timerPill").style.display = "inline-block";
  el("timerPill").textContent = `⏱ ${state.timeLeft}s`;

  state.timer = setInterval(() => {
    state.timeLeft -= 1;
    el("timerPill").textContent = `⏱ ${state.timeLeft}s`;
    if (state.timeLeft <= 0) {
      stopTimer();
      autoTimeout();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  el("timerPill").style.display = "none";
}

function autoTimeout() {
  const q = state.current;
  if (!q) return;
  el("feedback").innerHTML = `<div class="card"><strong>⏰ Time.</strong><div class="muted">Marked incorrect.</div></div>`;
  state.score.total += 1;
  scoreUnit(q.unit, false);
  countWrong(q.id || q.qid || norm(q.stem).slice(0, 40));
  el("nextBtn").disabled = false;
  disableSubmitButtons();
}

function disableSubmitButtons() {
  el("submitMcqBtn").disabled = true;
  el("submitOpenBtn").disabled = true;
}

function enableSubmitButtons() {
  el("submitMcqBtn").disabled = false;
  el("submitOpenBtn").disabled = false;
}

function pickSessionQuestions(units, mode, n) {
  let pool = [];
  units.forEach(u => {
    const arr = state.bankByUnit.get(u) || [];
    pool = pool.concat(arr);
  });

  if (mode === "mcq") pool = pool.filter(q => q.type === "mcq");
  if (mode === "open") pool = pool.filter(q => q.type === "open");

  shuffle(pool);
  return pool.slice(0, Math.min(n, pool.length));
}

function renderQuestion() {
  const q = state.sessionPool[state.idx];
  state.current = q;

  el("feedback").innerHTML = "";
  el("nextBtn").disabled = true;
  enableSubmitButtons();

  el("qMeta").textContent = `Unit: ${q.unit} • Type: ${q.type.toUpperCase()} • Difficulty: ${q.difficulty || "n/a"}`;
  el("progress").textContent = `Progress: ${state.idx + 1}/${state.sessionPool.length}`;

  el("mcqBlock").style.display = (q.type === "mcq") ? "block" : "none";
  el("openBlock").style.display = (q.type === "open") ? "block" : "none";

  if (q.type === "mcq") {
    el("qStem").textContent = q.stem;
    const choices = q.choices.map((c, i) => ({ c, i }));
    shuffle(choices);
    el("mcqChoices").innerHTML = choices.map(({c, i}, idx) => {
      return `<label><input type="radio" name="mcq" value="${i}"> ${String.fromCharCode(65+idx)}. ${c}</label>`;
    }).join("");
  } else {
    el("qStem").textContent = q.stem;
    el("openAnswer").value = "";
  }

  startTimer();
}

function submitMcq() {
  stopTimer();
  const q = state.current;
  const picked = document.querySelector('input[name="mcq"]:checked');
  if (!picked) {
    el("feedback").innerHTML = `<div class="card"><strong>Pick an answer first.</strong></div>`;
    return;
  }
  disableSubmitButtons();

  const originalIndex = parseInt(picked.value, 10);
  const correct = (originalIndex === q.answer_index);

  state.score.total += 1;
  if (correct) state.score.correct += 1;
  scoreUnit(q.unit, correct);
  if (!correct) countWrong(q.id || q.qid || norm(q.stem).slice(0, 40));

  const correctText = q.choices[q.answer_index];

  el("feedback").innerHTML = `
    <div class="card">
      <div><strong>${correct ? "✅ Correct" : "❌ Incorrect"}</strong></div>
      ${!correct ? `<div class="muted">Correct answer: ${correctText}</div>` : ``}
      <div style="margin-top:8px;">${q.explanation || ""}</div>
      <div class="muted" style="margin-top:8px;">Source: ${q.source?.file || "n/a"} (chunk ${q.source?.chunk_id ?? "?"})</div>
    </div>
  `;
  el("nextBtn").disabled = false;
}

function submitOpen() {
  stopTimer();
  const q = state.current;
  disableSubmitButtons();

  const user = el("openAnswer").value.trim();
  state.score.total += 1;
  scoreUnit(q.unit, false);

  el("feedback").innerHTML = `
    <div class="card">
      <div><strong>Self-check</strong></div>
      <div class="muted">Your answer:</div>
      <div style="white-space: pre-wrap; margin-bottom:10px;">${user || "(blank)"}</div>

      <div class="muted">Ideal answer:</div>
      <div style="margin-bottom:10px;">${q.ideal_answer || ""}</div>

      <div class="muted">Key points to include:</div>
      <ul>${(q.key_points || []).map(p => `<li>${p}</li>`).join("")}</ul>

      <div class="muted">Source: ${q.source?.file || "n/a"} (chunk ${q.source?.chunk_id ?? "?"})</div>
    </div>
  `;
  el("nextBtn").disabled = false;
}

function nextQuestion() {
  stopTimer();
  state.idx += 1;
  if (state.idx >= state.sessionPool.length) {
    endSession();
    return;
  }
  renderQuestion();
}

function endSession() {
  stopTimer();
  el("quizArea").style.display = "none";
  el("summaryArea").style.display = "block";

  const total = state.score.total;
  const correct = state.score.correct;
  const pct = total ? (correct / total * 100).toFixed(1) : "0.0";

  el("summaryText").innerHTML = `
    <div class="row">
      <span class="pill">Total: ${total}</span>
      <span class="pill">MCQ Correct: ${correct}</span>
      <span class="pill">Accuracy (MCQ only): ${pct}%</span>
    </div>
    <div class="muted" style="margin-top:10px;">
      Open-ended items are self-checked (not auto-graded).
    </div>
  `;

  const rows = [];
  state.byUnit.forEach((v, u) => {
    if (v.total > 0) {
      const upct = (v.correct / v.total * 100).toFixed(1);
      rows.push(`<div class="pill">${u}: ${v.correct}/${v.total} (${upct}%)</div>`);
    }
  });
  el("unitBreakdown").innerHTML = `<strong>By unit</strong><div class="row" style="margin-top:10px;">${rows.join("")}</div>`;

  const misses = Array.from(state.wrongCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0, 7);
  if (misses.length === 0) {
    el("weaknesses").innerHTML = `<strong>Weaknesses</strong><div class="muted" style="margin-top:10px;">No missed MCQs logged this session.</div>`;
  } else {
    el("weaknesses").innerHTML = `
      <strong>Weaknesses (most missed MCQs)</strong>
      <div class="muted" style="margin-top:8px;">Use this to target review.</div>
      <ol style="margin-top:10px;">
        ${misses.map(([qid, n]) => `<li>${qid} — missed ${n} time(s)</li>`).join("")}
      </ol>
    `;
  }
}

async function loadSelectedUnits(units) {
  el("loadStatus").textContent = "Loading question banks...";
  for (const [unit, file] of UNIT_FILES) {
    if (!units.includes(unit)) continue;
    if (state.bankByUnit.has(unit)) continue;

    const items = await fetchJsonl(file);

    const cleaned = items
      .filter(q => q && q.type && q.unit && q.stem)
      .map(q => ({
        ...q,
        unit: q.unit || unit,
        id: q.id || q.qid || `${unit}:${norm(q.stem).slice(0,40)}`,
      }));

    state.bankByUnit.set(unit, cleaned);
  }
  el("loadStatus").textContent = `Loaded: ${units.join(", ")}`;
}

function resetAll() {
  stopTimer();
  state.sessionPool = [];
  state.idx = 0;
  state.score = { correct: 0, total: 0 };
  state.current = null;
  el("quizArea").style.display = "none";
  el("summaryArea").style.display = "none";
  el("feedback").innerHTML = "";
}

async function startSession() {
  resetAll();

  const units = selectedUnits();
  if (units.length === 0) {
    el("loadStatus").textContent = "Pick at least one unit.";
    return;
  }

  state.mode = el("mode").value;
  const n = Math.max(5, Math.min(200, parseInt(el("numQ").value || "25", 10)));
  state.timerSec = Math.max(0, Math.min(180, parseInt(el("timerSec").value || "0", 10)));

  await loadSelectedUnits(units);

  initStats(units);

  const session = pickSessionQuestions(units, state.mode, n);
  if (session.length === 0) {
    el("loadStatus").textContent = "No questions found for that selection (try Mixed or select more units).";
    return;
  }

  state.sessionPool = session;
  state.idx = 0;

  el("summaryArea").style.display = "none";
  el("quizArea").style.display = "block";

  renderQuestion();
}

function wireUI() {
  el("selectAllBtn").onclick = () => setAllUnits(true);
  el("selectNoneBtn").onclick = () => setAllUnits(false);
  el("startBtn").onclick = () => startSession();
  el("resetBtn").onclick = () => resetAll();

  el("submitMcqBtn").onclick = () => submitMcq();
  el("submitOpenBtn").onclick = () => submitOpen();
  el("nextBtn").onclick = () => nextQuestion();
}

(function init() {
  buildUnitCheckboxes();
  wireUI();
  el("loadStatus").textContent = "Ready. Pick units and start practicing.";
})();
