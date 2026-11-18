// Entry point for the Temp: Diagram Options page: each option draws the Assessment Type Model and the CO Model side by
// side (variants in js/variants.js), from one example course per option. Each option's buttons play both diagrams at
// once: the average within each category, the average overall, or a semester unfolding (with the grade so far).
// Weights are changed with a bar beneath the diagram, or, for the pie, by dragging the handles on the ring.
// Options that offer it can colour scores by rubric score or by origin (an LO, or an assessment type). Coloured by
// origin, a key beside the diagram shows each origin's share of the grade as a bar, split into its applications, and
// pointing at an origin there picks out its scores. Some options can instead keep the rubric colours and, when a score
// is pointed at, light up every score from its origin and say the same of it. Some can also be drawn light (dark on light).

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VARIANTS, VARIANT_VIEW, PIE, categoriesOf, contributions, pieAngles } from "./variants.js";
import { assessmentTypeModel, coModel, format } from "./grading.js";
import { pastelFill, mellowFill } from "./palette.js";
import { optionPresets } from "./data.js";

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
 * In a variant that `lands` scores (the always-full stacks), with landing in a gap switched on, each session's scores
 * first land on top of the stacks as they were, then the bins share themselves out among them all, then any weight is applied.
 */
function unfold(variant, model, course, options) {
  const frame = (c, extra = {}, timing = {}) => ({
    ...variant.fill(model, c, { ...options, running: true, full: course, ...extra }),
    ease: "smooth", duration: 450, stagger: 0, hold: 650, grade: MODELS[model](c).final, course: c, ...timing,
  });
  return semester(course).flatMap((c, i) => {
    const session = course.sessions[i - 1]; // the session this step adds (none for the empty start)
    const type = session && course.assessmentTypes.find((t) => t.id === session.type);
    const ids = session ? new Set(c.scores.filter((s) => s.session === session.id).map((s) => s.id)) : new Set();
    const multiplied = model === "co" && type?.multiplier > 1;
    const once = multiplied ? countedOnce(c, type.id) : c;
    const landing = variant.lands && options.landing === "gap" && ids.size ? [frame(once, { arriving: ids }, { hold: 600 })] : [];
    if (!multiplied) return [...landing, frame(c)];
    return [
      ...landing,
      frame(once, {}, { hold: 700 }),
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

/* ---------- The origin key ---------- */

const KEY = { bar: 18, labelX: 28, line: 24, gap: 12 };
const share = (v) => `${(v * 100).toFixed(1)}%`;

/** What is said of an origin: its name and share of the grade, then (on hover) its applications and their worth. */
function describe(o) {
  const worths = o.applications.map((a) => a.share);
  const n = worths.length;
  const lo = Math.min(...worths);
  const hi = Math.max(...worths);
  return {
    name: o.name,
    share: `${Math.round(o.share * 100)}%`,
    fine: !n ? ["No applications yet"] : [
      `${n} application${n === 1 ? "" : "s"}`,
      n === 1 ? `worth ${share(hi)}` : `each worth ${share(lo)}${hi - lo > 5e-4 ? `–${share(hi)}` : ""}, ${share(o.share / n)} on average`,
    ],
  };
}

/**
 * Label centres along the key, pushed apart so none overlap (each needs `sizes[i]` of room, centred on it) and kept
 * within its length.
 */
function spread(ideal, sizes, length) {
  const at = [...ideal];
  at.forEach((v, i) => { at[i] = Math.max(v, i ? at[i - 1] + (sizes[i - 1] + sizes[i]) / 2 : sizes[0] / 2); });
  for (let i = at.length - 1; i >= 0; i--) {
    at[i] = Math.min(at[i], i < at.length - 1 ? at[i + 1] - (sizes[i] + sizes[i + 1]) / 2 : length - sizes[i] / 2);
  }
  return at;
}

const LABEL = { char: 8.6, pad: 14, row: 40 }; // a key label's width per character, the space around it, and a row's height beneath a bar

/**
 * The key, drawn in the pixels of the diagram (`chartSvg`) it sits beside or beneath: a bar spanning the diagram
 * (`span`, in viewBox units: its height, or, for a key beneath, `across` its width), a segment per origin in its colour
 * (as long as its share), split by thin lines into its applications, with each origin named beside or beneath it.
 * Beside, the first origin is at the bottom, as in the diagram's stacks; beneath, it is on the left, and the names
 * take two rows when they don't fit in one, each with its share beneath it. `plain` colours each origin by its average score instead of its origin
 * colour, for when the scores keep their rubric colours (origin on hover). Origins are parted by small gaps.
 */
function drawKey(svg, chartSvg, span, model, course, plain = false) {
  const chartBox = chartSvg.getBoundingClientRect();
  const keyBox = svg.getBoundingClientRect();
  if (!chartBox.height || !keyBox.width) return;
  const scale = chartBox.height / VARIANT_VIEW.h;
  const below = Boolean(span.across);
  const origins = contributions(model, course);
  // Origins are parted by gaps; the bar, gaps and all, spans the diagram.
  const gaps = KEY.gap * Math.max(0, origins.filter((o) => o.share > 0).length - 1);
  const [from, to] = below
    ? [span.across.left * scale + chartBox.left - keyBox.left, span.across.right * scale + chartBox.left - keyBox.left]
    : [span.base * scale, span.top * scale];
  const dir = below ? 1 : -1; // beneath, left to right; beside, bottom up
  const room = Math.max(0, Math.abs(to - from) - gaps);
  let at = from - dir * KEY.gap;
  const parts = origins.map((o, i) => {
    const len = room * o.share;
    if (len > 0) at += dir * KEY.gap;
    const start = dir > 0 ? at : at - len;
    at += dir * len;
    return { o, i, start, len, said: describe(o) };
  });
  const segment = ({ o, i, start, len }) => {
    // Cuts between applications, from the first origin's end of the segment.
    let cut = dir > 0 ? start : start + len;
    const cuts = o.applications.slice(0, -1).map((a) => {
      cut += dir * room * a.share;
      return below
        ? `<line class="key__cut" x1="${cut}" x2="${cut}" y1="0" y2="${KEY.bar}"/>`
        : `<line class="key__cut" x1="0" x2="${KEY.bar}" y1="${cut}" y2="${cut}"/>`;
    }).join("");
    const fill = plain ? `class="key__plain" style="fill: ${o.average === null ? "none" : mellowFill(o.average)}"` : `class="origin-${model}--${i}"`;
    const rect = below
      ? `<rect ${fill} x="${start}" y="0" width="${len}" height="${KEY.bar}"/>`
      : `<rect ${fill} x="0" y="${start}" width="${KEY.bar}" height="${len}"/>`;
    return rect + cuts;
  };

  let labels;
  if (below) {
    // Names beneath, centred on their segments: one row if they fit, else every other one drops to a second row.
    const widths = parts.map((p) => Math.max(p.said.name.length, p.said.share.length) * LABEL.char + LABEL.pad);
    const fits = widths.reduce((a, b) => a + b, 0) <= keyBox.width;
    const rows = fits ? [parts.map((_, n) => n)] : [parts.map((_, n) => n).filter((n) => n % 2 === 0), parts.map((_, n) => n).filter((n) => n % 2)];
    const centre = new Map();
    rows.forEach((row, r) => {
      const xs = spread(row.map((n) => parts[n].start + parts[n].len / 2), row.map((n) => widths[n]), keyBox.width);
      row.forEach((n, k) => centre.set(n, { x: xs[k], y: KEY.bar + 22 + r * LABEL.row }));
    });
    const height = KEY.bar + 44 + (rows.length - 1) * LABEL.row;
    svg.style.height = `${height}px`;
    svg.setAttribute("viewBox", `0 0 ${keyBox.width} ${height}`);
    // The name, with its share beneath it.
    labels = (p, n) => `<text class="key__name" x="${centre.get(n).x}" y="${centre.get(n).y}" text-anchor="middle">${p.said.name}<tspan class="key__share" x="${centre.get(n).x}" dy="18">${p.said.share}</tspan></text>`;
  } else {
    svg.style.height = `${chartBox.height}px`;
    svg.setAttribute("viewBox", `0 0 ${keyBox.width} ${chartBox.height}`);
    // Top down, for placing the names beside their segments.
    const order = parts.map((_, n) => n).reverse();
    const ys = spread(order.map((n) => parts[n].start + parts[n].len / 2), order.map(() => KEY.line), chartBox.height);
    const centre = new Map(order.map((n, k) => [n, ys[k]]));
    labels = (p, n) => `<text class="key__name" x="${KEY.labelX}" y="${centre.get(n)}" dominant-baseline="middle">${p.said.name} <tspan class="key__share">${p.said.share}</tspan></text>`;
  }
  svg.innerHTML = parts.map((p, n) => `<g class="from-${p.i}" data-origin="${p.i}" tabindex="0">${segment(p)}${labels(p, n)}</g>`).join("");
}

/** Show the hover label (`tip`, in `holder`) by the pointer, with what is said of an origin. */
function showTip(tip, holder, e, origin) {
  const said = describe(origin);
  const box = holder.getBoundingClientRect();
  const at = e.clientX !== undefined ? e : e.target.getBoundingClientRect(); // focused from the keyboard: by the label
  tip.innerHTML = `<strong>${said.name} ${said.share}</strong><br>${said.fine.join("<br>")}`;
  tip.style.left = `${(at.clientX ?? at.right) - box.left + 14}px`;
  tip.style.top = `${(at.clientY ?? at.top) - box.top + 14}px`;
  tip.hidden = false;
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
  const store = createStore(optionPresets);
  let action = "fill"; // what the diagrams show once their sequence ends; an edit redraws its last frame
  let timers = [];
  section.classList.toggle("option--key-below", Boolean(variant.control.span.across)); // the key sits beneath the diagram
  const settings = { colouring: "rubric", theme: "dark", landing: "gap" };
  const unhover = (side) => {
    delete side.dataset.highlight;
    const tip = side.querySelector(".option__tip");
    if (tip) tip.hidden = true;
  };

  const sides = [...section.querySelectorAll("[data-model]")].map((side) => {
    const model = side.dataset.model;
    const svg = side.querySelector("svg");
    const chart = createChart(svg, VARIANT_VIEW);
    const grade = side.querySelector(".option__grade-value");
    let bar = null;
    if (variant.control.type === "ring") ringControl(svg, store, model);
    else bar = barControl(side.querySelector(".option__chart"), store, model, variant.control);
    // A key to the origins, right of the diagram, shown while scores are coloured by origin (or, uncoloured, with origin on hover).
    // Pointing at (or focusing) an origin picks out its scores in the diagram, and a label by the pointer gives the finer detail.
    // Pointing at a score in the diagram does the same for its origin (whenever scores are marked by origin).
    let key = null;
    const state = { course: store.get() }; // the course the diagram shows now (mid-semester, while one unfolds)
    if (variant.colourings) {
      // What is said of the origin pointed at, in a label by the pointer.
      const tip = document.createElement("p");
      tip.className = "option__tip";
      tip.hidden = true;
      side.append(tip);
      const hover = (e, i) => {
        const origin = contributions(model, state.course)[i];
        if (!origin) return unhover(side);
        side.dataset.highlight = i;
        showTip(tip, side, e, origin);
      };

      key = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      key.classList.add("option__key");
      key.setAttribute("role", "img");
      key.setAttribute("aria-label", model === "at" ? "Each LO's share of the grade" : "Each assessment type's share of the grade");
      key.addEventListener("pointermove", (e) => {
        const item = e.target.closest("[data-origin]");
        if (item) hover(e, item.dataset.origin);
        else unhover(side);
      });
      key.addEventListener("pointerleave", () => unhover(side));
      key.addEventListener("focusin", (e) => {
        const item = e.target.closest("[data-origin]");
        if (item) hover(e, item.dataset.origin);
      });
      key.addEventListener("focusout", () => unhover(side));
      side.querySelector(".option__grade").before(key);
      // Redrawn whenever the diagram changes size, to stay as tall as it.
      new ResizeObserver(() => { if (!key.hidden) drawKey(key, svg, variant.control.span, model, state.course, settings.colouring === "hover"); }).observe(svg);

      svg.addEventListener("pointermove", (e) => {
        if (settings.colouring === "rubric") return;
        const mark = e.target.closest?.('[class*="from-"]')?.getAttribute("class").match(/\bfrom-(\d+)\b/);
        if (mark) hover(e, mark[1]);
        else unhover(side);
      });
      svg.addEventListener("pointerleave", () => unhover(side));
    }
    return { el: side, svg, model, chart, grade, bar, key, state };
  });

  // Each switch above the diagrams (colouring: rubric, origin or origin on hover; theme: dark or light; landing: in a gap
  // or straight into the full stack) sets one option for both.
  function set(name, value) {
    settings[name] = value;
    section.querySelectorAll(`[data-setting="${name}"] [data-value]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
    section.classList.toggle("option--light", (variant.theme ?? settings.theme) === "light");
    section.classList.toggle("option--hover", settings.colouring === "hover");
    const keyed = settings.colouring === "origin" || settings.colouring === "hover";
    section.classList.toggle("option--keyed", keyed);
    sides.forEach((side) => {
      side.key?.toggleAttribute("hidden", !keyed);
      unhover(side.el);
      if (side.key && !side.key.hidden) drawKey(side.key, side.svg, variant.control.span, side.model, side.state.course, settings.colouring === "hover");
    });
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
        side.state.course = frame.course ?? course;
        if (side.key && !side.key.hidden) drawKey(side.key, side.svg, variant.control.span, side.model, side.state.course, settings.colouring === "hover");
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
