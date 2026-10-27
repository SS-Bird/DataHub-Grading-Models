// Entry point: wires the model choice, the example (timeline, weight bars, multipliers)
// and the scroll steps to the shared store.

import { createStore } from "./store.js";
import { createTimeline } from "./timeline.js";
import { createWeightBar } from "./weights.js";
import { createMultipliers } from "./multipliers.js";
import { createChart } from "./chart.js";
import { createSandbox } from "./sandbox.js";
import { VIEW, STAGES, assessmentTypeFrame, coFrame } from "./scenes.js";

const page = document.querySelector(".page");
const store = createStore();
const views = [
  createTimeline(document.querySelector(".timeline"), store),
  ...[...document.querySelectorAll(".weights__bar")].map((el) => createWeightBar(el, store, el.dataset.list)),
  createMultipliers(document.querySelector(".multipliers"), store),
  {
    render: () => document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === store.preset()))),
  },
];

/* ---------- Demonstration ---------- */

const demo = document.querySelector(".demo");
const panels = [
  { chart: createChart(demo.querySelector('[data-model="at"] svg'), VIEW), frame: assessmentTypeFrame },
  { chart: createChart(demo.querySelector('[data-model="co"] svg'), VIEW), frame: coFrame },
];
let stage = STAGES[0];

function drawDemo() {
  const course = store.get();
  panels.forEach((p) => p.chart.render(p.frame(course, stage)));
}

// Edits can arrive many times a second while dragging, so redraw the demo at most once per animation frame.
let pending = false;
function scheduleDemo() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    drawDemo();
  });
}

// A step becomes active when it crosses the middle of the viewport
// (lower down on small screens, where the figure fills the top of the screen).
// Both models' sidebars have a step for every stage, so they stay level with each other.
const steps = [...demo.querySelectorAll(".step")];
const narrow = window.matchMedia("(max-width: 50rem)").matches;
const observer = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    stage = e.target.dataset.stage;
    steps.forEach((s) => s.classList.toggle("is-active", s.dataset.stage === stage));
    drawDemo();
  }),
  { rootMargin: narrow ? "-75% 0px -24% 0px" : "-50% 0px -49% 0px" },
);
steps.forEach((step) => observer.observe(step));

const sandbox = createSandbox(document.querySelector(".sandbox"), store, () => page.dataset.mode);

/* ---------- Controls ---------- */

// The header's Calculations menu links here with a hash naming the model to show.
const HASH_MODES = { "#assessment-type-model": "at", "#co-based-model": "co", "#side-by-side": "split" };

function followHash(hash) {
  const mode = HASH_MODES[hash];
  if (!mode) return;
  setMode(mode);
  document.querySelector(".example").scrollIntoView({ behavior: "smooth" });
}

function setMode(mode) {
  page.dataset.mode = mode;
  document.querySelectorAll("[data-mode-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modeChoice === mode)));
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href*='#']");
  if (link && link.pathname === location.pathname && HASH_MODES[link.hash]) {
    e.preventDefault();
    history.replaceState(null, "", link.hash);
    followHash(link.hash);
  }
  const choice = e.target.closest("[data-mode-choice]");
  if (choice) {
    setMode(choice.dataset.modeChoice);
    if ("scroll" in choice.dataset) document.querySelector(".example").scrollIntoView({ behavior: "smooth" });
  }
  const preset = e.target.closest("[data-preset]");
  if (preset) store.load(preset.dataset.preset);
  if (e.target.closest("[data-action='reset']")) store.load();
});

store.subscribe(() => {
  views.forEach((v) => v.render());
  scheduleDemo();
});

views.forEach((v) => v.render());
setMode(page.dataset.mode);
followHash(location.hash);
drawDemo();
sandbox.render();
