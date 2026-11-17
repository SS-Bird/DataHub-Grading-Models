// Entry point for the Temp: Diagram Options page: each option draws the Assessment Type Model and the CO Model side by
// side (variants in js/variants.js), from one example course per option. Each option's buttons play both diagrams at
// once: the average within each category, the average overall, or a semester unfolding (with the grade so far).
// Weights are changed with a bar beneath the diagram, or, for the pie, by dragging the handles on the ring.
// Options that offer it can colour scores by rubric score or by origin (an LO, or an assessment type), with a key
// that picks out an origin's scores when pointed at; some can also be drawn light (dark on light) instead of dark.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VARIANTS, VARIANT_VIEW, PIE, categoriesOf, originsOf, pieAngles } from "./variants.js";
import { assessmentTypeModel, coModel, format } from "./grading.js";
import { pastelFill } from "./palette.js";
import { explainerPresets } from "./data.js";

const PAUSE = 1600; // between frames of a sequence, unless a frame sets its own `hold`
const MIN_SHARE = 0.05; // no category can be dragged below this share of the grade
const STEP = 0.01;
const LISTS = { at: "assessmentTypes", co: "outcomes" };
const MODELS = { at: assessmentTypeModel, co: coModel };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = (w) => Math.round(w / STEP) * STEP;
const pct = (v, of) => `${(v / of) * 100}%`;

/** The semester from its start: one course per session, each with that session's scores added. */
function semester(course) {
  return [[], ...course.sessions.map((_, i) => course.sessions.slice(0, i + 1))].map((sessions) => {
    const held = new Set(sessions.map((s) => s.id));
    return { ...course, scores: course.scores.filter((s) => held.has(s.session)) };
  });
}

/** The course with one assessment type's scores counted only once. */
const countedOnce = (course, typeId) => ({
  ...course, assessmentTypes: course.assessmentTypes.map((t) => (t.id === typeId ? { ...t, multiplier: 1 } : t)),
});

/**
 * The semester from its start, with the grade so far. In the CO model, a multiplied assignment's scores first arrive
 * counted once, at the usual size, then grow to their weight while a badge ("4×") says how many times they count.
 */
function unfold(variant, model, course, options) {
  const frame = (c, extra = {}, timing = {}) => ({
    ...variant.fill(model, c, { ...options, running: true, full: course, ...extra }),
    ease: "smooth", duration: 450, stagger: 0, hold: 650, grade: MODELS[model](c).final, ...timing,
  });
  return semester(course).flatMap((c, i) => {
    const session = course.sessions[i - 1]; // the session this step adds (none for the empty start)
    const type = session && course.assessmentTypes.find((t) => t.id === session.type);
    if (model !== "co" || !(type?.multiplier > 1)) return [frame(c)];
    const ids = new Set(c.scores.filter((s) => s.session === session.id).map((s) => s.id));
    return [
      frame(countedOnce(c, type.id), {}, { hold: 700 }),
      frame(c, { grow: { ids, times: type.multiplier } }, { duration: 900, hold: 1300 }),
      frame(c), // the badges go
    ];
  });
}

/** The frames each button plays, for one model's diagram; `options` are passed to the variant (its colouring). */
function sequence(variant, model, course, action, options) {
  const filled = { ...variant.fill(model, course, options), duration: 500, stagger: 0, hold: 300 };
  const grade = MODELS[model](course).final;
  const within = { ...variant.within(model, course, options), duration: 1400, stagger: 0, grade };
  switch (action) {
    case "within": return [filled, within];
    case "overall": return [filled, { ...within, hold: 2000 }, ...variant.overall(model, course, options).map((f) => ({ duration: 1200, stagger: 0, ...f, grade }))];
    case "unfold": return unfold(variant, model, course, options);
    default: return [{ ...variant.fill(model, course, options), duration: 600, stagger: 0 }];
  }
}

/** Move the edge after category i of `list` to `edge` (a share of the whole, from the start). */
function moveEdge(store, list, i, edge) {
  const weights = store.get()[list].map((t) => t.weight);
  const total = sum(weights);
  const before = sum(weights.slice(0, i));
  const pair = weights[i] + weights[i + 1];
  const floor = MIN_SHARE * total;
  if (2 * floor > pair) return;
  const upper = clamp(snap(edge * total - before), Math.ceil(floor / STEP - 1e-9) * STEP, Math.floor((pair - floor) / STEP + 1e-9) * STEP);
  weights[i] = upper;
  weights[i + 1] = snap(pair - upper);
  store.setWeights(list, weights);
}

/** Drag the handles on a pie's ring to move weight between neighbouring slices. */
function ringControl(svg, store, model) {
  const list = LISTS[model];
  const toView = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const angleOf = (p) => (Math.atan2(p.x - PIE.cx, PIE.cy - p.y) + 2 * Math.PI) % (2 * Math.PI);
  let dragging = null;

  svg.addEventListener("pointerdown", (e) => {
    const p = toView(e);
    const r = Math.hypot(p.x - PIE.cx, p.y - PIE.cy);
    if (r < PIE.ring[0] - 14 || r > PIE.ring[1] + 14) return;
    const a = angleOf(p);
    const edges = pieAngles(categoriesOf(model, store.get()).cats).slice(0, -1).map((s) => s.a1);
    const near = edges.map((edge, i) => ({ i, d: Math.abs(edge - a) })).sort((x, y) => x.d - y.d)[0];
    if (!near || near.d * r > 18) return;
    dragging = near.i;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (dragging === null) return;
    moveEdge(store, list, dragging, angleOf(toView(e)) / (2 * Math.PI));
  });
  svg.addEventListener("lostpointercapture", () => {
    dragging = null;
    svg.classList.remove("is-dragging");
  });
}

/** A weight bar laid over the chart, lined up with the diagram (`control` is in viewBox units). */
function barControl(holder, store, model, control) {
  const el = document.createElement("div");
  el.className = "weights__bar option__bar";
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", `${model === "at" ? "Assessment Type Model" : "CO Model"} weights`);
  Object.assign(el.style, { left: pct(control.x, VARIANT_VIEW.w), width: pct(control.w, VARIANT_VIEW.w), top: pct(control.y, VARIANT_VIEW.h) });
  holder.append(el);
  return createWeightBar(el, store, LISTS[model], { horizontal: true, min: MIN_SHARE });
}

function createOption(section) {
  const variant = VARIANTS[section.dataset.variant];
  const store = createStore(explainerPresets);
  let action = "fill"; // what the diagrams show once their sequence ends; an edit redraws its last frame
  let timers = [];

  const sides = [...section.querySelectorAll("[data-model]")].map((side) => {
    const model = side.dataset.model;
    const svg = side.querySelector("svg");
    const chart = createChart(svg, VARIANT_VIEW);
    const grade = side.querySelector(".option__grade-value");
    let bar = null;
    if (variant.control.type === "ring") ringControl(svg, store, model);
    else bar = barControl(side.querySelector(".option__chart"), store, model, variant.control);
    // A key to the origin colours, beneath the grade, shown while scores are coloured by origin.
    // Pointing at (or focusing) an origin picks out its scores in the diagram.
    let legend = null;
    if (variant.colourings) {
      legend = document.createElement("ul");
      legend.className = "option__legend";
      legend.setAttribute("aria-label", model === "at" ? "Colour of each LO" : "Colour of each assessment type");
      legend.innerHTML = originsOf(model, store.get()).map((o, i) => `
        <li tabindex="0" data-origin="${i}"><span class="option__swatch" style="background: var(--origin-${model}-${i})"></span>${o.name}</li>`).join("");
      const pick = (e) => {
        const item = e.target.closest("[data-origin]");
        if (item) side.dataset.highlight = item.dataset.origin;
      };
      const unpick = () => delete side.dataset.highlight;
      legend.addEventListener("pointerover", pick);
      legend.addEventListener("focusin", pick);
      legend.addEventListener("pointerleave", unpick);
      legend.addEventListener("focusout", unpick);
      side.querySelector(".option__grade").append(legend);
    }
    return { model, chart, grade, bar, legend };
  });

  // Each switch above the diagrams (colouring: rubric or origin; theme: dark or light) sets one option for both.
  const settings = { colouring: "rubric", theme: "dark" };
  function set(name, value) {
    settings[name] = value;
    section.querySelectorAll(`[data-setting="${name}"] [data-value]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
    section.classList.toggle("option--light", settings.theme === "light");
    sides.forEach((side) => side.legend?.toggleAttribute("hidden", settings.colouring !== "origin"));
  }
  Object.entries(settings).forEach(([name, value]) => set(name, value));

  function showGrade(side, value) {
    side.grade.textContent = format(value ?? null);
    side.grade.style.background = value === null || value === undefined ? "" : pastelFill(value);
  }

  /** Play each side's frames, each held for its `hold`; `from` the end jumps straight to the last frame. */
  function play(next, { jump = false } = {}) {
    timers.forEach(clearTimeout);
    timers = [];
    action = next;
    const course = store.get();
    sides.forEach((side) => {
      side.bar?.render();
      const frames = sequence(variant, side.model, course, next, settings);
      const step = (i) => {
        const frame = frames[i];
        side.chart.render(frame);
        showGrade(side, "grade" in frame ? frame.grade : MODELS[side.model](course).final);
        if (i + 1 < frames.length) timers.push(setTimeout(() => step(i + 1), frame.hold ?? PAUSE));
      };
      step(jump ? frames.length - 1 : 0);
    });
  }

  // Changing a weight redraws what is shown, without replaying it (a semester unfolding goes back to the scores).
  store.subscribe(() => play(action === "unfold" ? "fill" : action, { jump: true }));
  section.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (button) play(button.dataset.action);
    // A new setting shows the scores in it.
    const choice = e.target.closest("[data-setting] [data-value]");
    if (choice) {
      set(choice.closest("[data-setting]").dataset.setting, choice.dataset.value);
      play("fill");
    }
  });
  play("fill");
}

document.querySelectorAll(".option[data-variant]").forEach(createOption);
