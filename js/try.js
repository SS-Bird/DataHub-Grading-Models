// Entry point for the Try It Yourself page: both models' sized diagrams of an example course, which scores can be
// dragged into, with a key of every assessment and LO beside them.
// Hovering (or focusing) an assessment or LO lights up its scores; hovering a score lights up its assessment and LO.
// Toggles reveal preset score examples, a timeline of the scores to edit them on, and "Edit class structure", which
// turns the key into an editor: rename, remove and add assignments and LOs, and change how many times each
// assessment's scores count in the CO model (its weight).
// Either model can be shown alone, or both side by side, each with its shares in a bar lined up beneath its bins.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { createStore, MAX_ASSIGNMENTS, MAX_LOS } from "./store.js";
import { createSandbox } from "./sandbox.js";
import { createWeightBar } from "./weights.js";
import { createTimeline } from "./timeline.js";
import { SANDBOX_BINS, VIEW } from "./scenes.js";
import { plainPresets, NUMBER_WORDS } from "./data.js";

const page = document.querySelector(".page");
const section = document.querySelector(".sandbox");
const example = createStore(plainPresets);
const sandbox = createSandbox(section, example, () => page.dataset.mode, { sized: true });
const store = sandbox.store;
const key = section.querySelector(".score-key");

const MAX_MULTIPLIER = 5; // as on the Calculations page's multiplier picker
const escape = (text) => text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* ---------- Presets ---------- */

function renderPresets() {
  section.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === example.preset())));
}

section.addEventListener("click", (e) => {
  const preset = e.target.closest("[data-preset]");
  if (preset) example.load(preset.dataset.preset);
  const choice = e.target.closest("[data-mode-choice]");
  if (choice) setMode(choice.dataset.modeChoice);
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) reveal(toggle);
});
example.subscribe(renderPresets);

/* ---------- Toggles: preset examples, the timeline, and editing the class structure ---------- */

const timeline = createTimeline(section.querySelector(".sandbox__timeline svg"), store);
store.subscribe(() => timeline.render());

/** Open or close what a toggle controls: the preset examples, the timeline, or editing in the key. */
function reveal(toggle) {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  if (toggle.dataset.toggle === "structure") {
    editing = open;
    renderKey();
    return;
  }
  document.getElementById(toggle.getAttribute("aria-controls")).hidden = !open;
  alignShares(); // the diagrams moved
}

/* ---------- Model shown, and its weights ---------- */

function setMode(mode) {
  page.dataset.mode = mode;
  section.querySelectorAll("[data-mode-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modeChoice === mode)));
  alignShares();
}

let bars = [];
let structure = "";

/** Weight bars are built for a fixed set of categories, so they are rebuilt when the categories change. */
function renderWeights() {
  const course = store.get();
  const now = JSON.stringify([course.assessmentTypes.map((t) => [t.id, t.shortName]), course.outcomes.map((o) => [o.id, o.name])]);
  if (now !== structure) {
    structure = now;
    bars = [...section.querySelectorAll(".weights__bar")].map((el) => {
      el.replaceChildren();
      return createWeightBar(el, store, el.dataset.list, { horizontal: true });
    });
  }
  bars.forEach((b) => b.render());
}
store.subscribe(renderWeights);

/** Line each shares bar up with its diagram's bins, wherever the diagram is drawn within its panel. */
function alignShares() {
  section.querySelectorAll(".panel").forEach((panel) => {
    const svg = panel.querySelector("svg");
    const shares = panel.querySelector(".shares");
    const box = svg.getBoundingClientRect();
    if (!box.width) return; // panel hidden for the unchosen model
    // The diagram keeps its shape, centred across the svg (and sitting on its bottom, just above the bar):
    // work out its scale and where its left edge falls.
    const scale = Math.min(box.width / VIEW.w, box.height / VIEW.h);
    const left = box.left + (box.width - VIEW.w * scale) / 2 - panel.getBoundingClientRect().left;
    shares.style.marginLeft = `${left + SANDBOX_BINS.x * scale}px`;
    shares.style.width = `${SANDBOX_BINS.w * scale}px`;
  });
}
new ResizeObserver(alignShares).observe(section.querySelector(".panels"));

/* ---------- Key ---------- */

let editing = false;

/**
 * One assessment or LO: a button to hover, or, while editing, its name to change and a button to remove it.
 * An assessment also shows its weight (how many times its scores count in the CO model), editable alongside its name.
 */
function item(attr, id, name, removable, multiplier = null) {
  const weight = multiplier === null ? "" : editing
    ? `<label class="score-key__mult">×<input type="number" min="1" max="${MAX_MULTIPLIER}" value="${multiplier}" data-multiplier aria-label="How many times ${escape(name)} scores count"></label>`
    : `<span class="score-key__mult">×${multiplier}</span>`;
  if (!editing) return `<li><button type="button" class="score-key__item" ${attr}="${escape(id)}"><span>${escape(name)}</span>${weight}</button></li>`;
  return `
    <li class="score-key__item score-key__item--edit" ${attr}="${escape(id)}">
      <input class="score-key__name" value="${escape(name)}" aria-label="Name of ${escape(name)}">
      ${weight}
      ${removable ? `<button type="button" class="score-key__remove" data-remove aria-label="Remove ${escape(name)}">×</button>` : ""}
    </li>`;
}

function addButton(label, action, disabled, extra = "") {
  return editing ? `<button type="button" class="score-key__add" data-add="${action}" ${extra} ${disabled ? "disabled" : ""}>+ ${label}</button>` : "";
}

function renderKey() {
  const course = store.get();
  const assignments = course.assessmentTypes.filter((t) => t.id !== "class");
  const los = course.outcomes.flatMap((o) => o.los);
  key.innerHTML = `
    <p class="side__title score-key__head"><span>Assessments</span><span>Weight</span></p>
    <ul class="score-key__list">
      ${course.assessmentTypes.map((t) => item("data-type", t.id, t.name, t.id !== "class", t.multiplier)).join("")}
    </ul>
    ${addButton("Assignment", "assignment", assignments.length >= MAX_ASSIGNMENTS)}
    <p class="side__title">Learning Outcomes</p>
    ${course.outcomes.map((co) => `
      ${editing
        ? `<input class="score-key__name score-key__group" data-outcome="${escape(co.id)}" value="${escape(co.name)}" aria-label="Name of ${escape(co.name)}">`
        : `<p class="score-key__group">${escape(co.name)}</p>`}
      <ul class="score-key__list">
        ${co.los.map((lo) => item("data-lo", lo, lo, los.length > 1)).join("")}
      </ul>
      ${addButton("LO", "lo", los.length >= MAX_LOS, `data-outcome="${escape(co.id)}"`)}`).join("")}`;
  light();
}

/** A name not used yet: "Assignment 4", "LO Five", … */
function freshName(prefix, taken, words = false) {
  const label = (n) => `${prefix} ${words ? NUMBER_WORDS[n - 1] ?? n : n}`;
  let n = taken.length + 1;
  while (taken.includes(label(n))) n += 1;
  return label(n);
}

function focusName(attr, id) {
  const input = key.querySelector(`[${attr}="${CSS.escape(id)}"] .score-key__name`);
  input?.focus();
  input?.select();
}

key.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add?.dataset.add === "assignment") {
    const id = store.addAssignment(freshName("Assignment", store.get().assessmentTypes.map((t) => t.name)));
    if (id) focusName("data-type", id);
  } else if (add?.dataset.add === "lo") {
    const name = freshName("LO", store.get().outcomes.flatMap((o) => o.los), true);
    if (store.addLO(add.dataset.outcome, name)) focusName("data-lo", name);
  }
  const remove = e.target.closest("[data-remove]")?.closest(".score-key__item");
  if (remove?.dataset.type) store.removeAssignment(remove.dataset.type);
  else if (remove?.dataset.lo) store.removeLO(remove.dataset.lo);
});

// Names and weights change when the field is left (or Enter is pressed); an empty name, or an LO name already in use,
// is refused, and a weight is kept between 1 and MAX_MULTIPLIER.
key.addEventListener("change", (e) => {
  const row = e.target.closest(".score-key__item");
  const name = e.target.value.trim();
  if ("multiplier" in e.target.dataset) {
    const value = Math.round(Number(e.target.value));
    if (value >= 1 && value <= MAX_MULTIPLIER) store.setMultiplier(row.dataset.type, value);
    else renderKey();
  } else if (e.target.dataset.outcome) {
    if (name) store.renameOutcome(e.target.dataset.outcome, name);
    else renderKey();
  } else if (row.dataset.type) {
    if (name) store.renameAssignment(row.dataset.type, name);
    else renderKey();
  } else if (!store.renameLO(row.dataset.lo, name)) {
    renderKey();
  }
});
key.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches(".score-key__name, [data-multiplier]")) e.target.blur();
});

/* ---------- Lighting up ---------- */

let lit = null; // { type }, { lo } or { score }

/** Light up the matching scores in both diagrams (copies too, the rest fade) and the matching key entries. */
function light() {
  const course = store.get();
  const typeOf = new Map(course.sessions.map((s) => [s.id, s.type]));
  const scores = new Map(course.scores.map((s) => [s.id, s]));
  const hovered = lit?.score ? scores.get(lit.score) : null;
  const matches = (d) => {
    const s = scores.get(d.copyOf ?? d.key);
    if (!s) return false;
    if (lit.score) return s.id === lit.score;
    return lit.type ? typeOf.get(s.session) === lit.type : s.lo === lit.lo;
  };
  section.querySelectorAll(".panel svg").forEach((svg) => {
    svg.classList.toggle("is-lighting", lit !== null);
    d3.select(svg).selectAll("g.token").classed("is-lit", (d) => lit !== null && matches(d));
  });
  key.querySelectorAll(".score-key__item").forEach((el) => {
    const on = hovered
      ? el.dataset.type === typeOf.get(hovered.session) || el.dataset.lo === hovered.lo
      : lit !== null && (lit.type ? el.dataset.type === lit.type : el.dataset.lo === lit.lo);
    el.classList.toggle("is-active", on);
  });
}

function show(next) {
  lit = next;
  light();
}

const keyEntry = (el) => {
  const entry = el.closest(".score-key__item");
  if (!entry) return null;
  return entry.dataset.type ? { type: entry.dataset.type } : { lo: entry.dataset.lo };
};
key.addEventListener("pointerover", (e) => show(keyEntry(e.target)));
key.addEventListener("focusin", (e) => show(keyEntry(e.target)));
key.addEventListener("pointerleave", () => show(null));
key.addEventListener("focusout", () => show(null));

// Hovering a score in either diagram lights up its assessment and LO in the key.
const panels = section.querySelector(".panels");
panels.addEventListener("pointerover", (e) => {
  const token = e.target.closest("g.token");
  const d = token && d3.select(token).datum();
  show(d ? { score: d.copyOf ?? d.key } : null);
});
panels.addEventListener("pointerleave", () => show(null));

// Redrawing the diagrams resets their classes, so the key is redrawn (and lit again) after every change.
store.subscribe(renderKey);

renderPresets();
renderWeights();
setMode(page.dataset.mode);
timeline.render();
renderKey();
sandbox.render();
