// Alternative grade diagrams, for the Temp: Diagram Options page. Each variant draws either model ("at" or "co")
// as frames for chart.js, in three modes: "fill" (every score), "within" (each category melted into its average)
// and "overall" (every category melted into the course grade). Pure layout: no DOM access here.
//
//   histogram  a bin per category, with a bar per score level (0–5) as tall as its frequency (how many scores at that level)
//   stacked    a bin per category, as wide as its weight, always full: a stack of bands, one per score
//   filling    the same bins, filled by bands of one constant height, so a bin fills up as scores arrive
//              (in both, a multiplied score is one band, that many times taller, and new scores land on top;
//              coloured by origin, the bands gather by origin instead)
//   donut      a ring with a slice per category as wide as its weight, each score an equal piece standing out from a
//              small inner circle, as high as its score (drawn by `rose`, which with no hole would draw it as a pie)
// Averaged within, each category fills its bin (or slice); averaged overall, the grade fills the whole diagram.
//
// Options (passed in each mode's `options`):
//   colouring: "rubric" colours scores by rubric score; "origin" by where they came from, in the Assessment Type Model
//              a score's LO, in the CO Model its assessment type (see `originsOf`); "hover" keeps the rubric colours
//              but marks each score's origin, so the page can light up an origin's scores when one is pointed at.
//              Variants with `colourings` offer it (the stacked and pie variants offer "hover" too).
//   theme:     "dark" draws dark bins and pastel scores; "light" outline bins and mellow scores (`themes`).
//              The always-full stacked bars are always light (`theme`), and the pie always takes the mellow colours.
//   grow:      { ids, times }: a badge ("4×") on the scores with these ids, as they grow to their weight.
// Score elements coloured or marked by origin get the class `from-N` (N in originsOf order), so the page can pick them out.
// Every variant also names where its weight control sits (`control`, in viewBox units): a bar beneath the bins, or a
// ring around the pie; and the height its diagram spans (`control.span`: top and base), for a key beside it, or, for
// a key beneath it, its width (`span.across`: left and right).

import { assessmentTypeModel, coModel, format, percent, SCORE_MAX } from "./grading.js";
import { pastelFill, mellowFill } from "./palette.js";

export const VARIANT_VIEW = { w: 640, h: 520 };
const LEVELS = [0, 1, 2, 3, 4, 5];
const NAMES = { at: "Assessment Type Model", co: "CO Model" };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const blank = () => ({ rects: [], paths: [], lines: [], links: [], tokens: [], outlines: [], texts: [] });
const title = (model) => ({ key: "title", x: VARIANT_VIEW.w / 2, y: 36, text: NAMES[model], size: 22, anchor: "middle", cls: "title" });
const averageSize = (share) => clamp(64 * share, 14, 56);
const label = (key, x, y, text, size = 13, extra = {}) => ({ key, x, y, text, size, anchor: "middle", cls: "label label--strong", ...extra });
const byArrival = (a, b) => a.order - b.order || (a.copy ?? 0) - (b.copy ?? 0);
/** A brief badge saying how many times a score is counted, while it grows to its weight. */
const growBadge = (key, x, y, times, cls = "label label--strong") => ({ key: `grow-${key}`, x, y, text: `${times}×`, size: 16, anchor: "middle", cls: `${cls} grow-badge` });

/* ---------- Themes: how a score, or an average, is coloured ---------- */

const light = (theme) => theme === "light";
/** A score's class: pastel on dark diagrams, mellow (between pastel and full strength) on light ones. */
const scoreClass = (score, theme) => (light(theme) ? `mellow--${score}` : `pastel--${score}`);
/** An average's fill, blended between rubric colours. */
const scoreFill = (value, theme) => (light(theme) ? mellowFill(value) : pastelFill(value));
/** Text written on an average's fill: dark on pastel, white on mellow. */
const onFill = (theme) => (light(theme) ? "average on-fill" : "average");

/* ---------- Categories and origins ---------- */

/** A model's categories ({ id, name, weight, average, scores }) and its grade. Scores are in the order they arrived; CO scores include their copies. */
export function categoriesOf(model, course) {
  if (model === "at") {
    const r = assessmentTypeModel(course);
    return { cats: r.types.map((t) => ({ id: t.id, name: t.shortName, weight: t.weight, average: t.average, scores: t.scores })), final: r.final };
  }
  const r = coModel(course);
  return {
    cats: r.outcomes.map((co) => ({ id: co.id, name: co.name, weight: co.weight, average: co.average, scores: co.los.flatMap((lo) => lo.scores).sort(byArrival) })),
    final: r.final,
  };
}

/** Where a model's scores come from, the other model's way of sorting them: LOs for the AT model, assessment types for the CO model. */
export function originsOf(model, course) {
  return model === "at"
    ? course.outcomes.flatMap((o) => o.los).map((lo) => ({ id: lo, name: course.loShort[lo] ?? lo }))
    : course.assessmentTypes.map((t) => ({ id: t.id, name: t.shortName }));
}

const originId = (model, s) => (model === "at" ? s.lo : s.source);

/**
 * How much of the grade each origin carries, in originsOf order: its `share` of the grade, its `applications`
 * (each a score, with its copies, and that score's share), in the order they arrived, and their `average` score. Within a category every score
 * (or copy) counts equally, so a score's share is its category's share of the scored weight, split among its scores.
 */
export function contributions(model, course) {
  const { cats } = categoriesOf(model, course);
  const scored = sum(cats.filter((c) => c.scores.length).map((c) => c.weight)) || 1;
  const index = originIndex(model, course);
  const origins = originsOf(model, course).map((o) => ({ ...o, share: 0, applications: [] }));
  const byKey = new Map();
  cats.forEach((c) => c.scores.forEach((s) => {
    const each = c.weight / scored / c.scores.length;
    const key = s.copyOf ?? s.key;
    const origin = origins[index.get(originId(model, s))];
    origin.share += each;
    if (byKey.has(key)) byKey.get(key).share += each;
    else {
      const application = { key, share: each, order: s.order, score: s.score };
      byKey.set(key, application);
      origin.applications.push(application);
    }
  }));
  origins.forEach((o) => {
    o.applications.sort((a, b) => a.order - b.order);
    o.average = o.applications.length ? sum(o.applications.map((a) => a.score)) / o.applications.length : null;
  });
  return origins;
}

/** Each origin's place in originsOf, by id. */
const originIndex = (model, course) => new Map(originsOf(model, course).map((o, i) => [o.id, i]));

/**
 * The classes that colour an origin's scores, from its place in originsOf: each model has its own colour set,
 * since its origins are different things (`origin-at--0`, … for LOs; `origin-co--0`, … for assessment types).
 */
const originClass = (model, i) => `origin-${model}--${i} from-${i}`;

/** A score's colour classes: by origin, or by rubric score (marked with its origin, for "hover"). */
function colourOf(model, colouring, theme, score, i) {
  if (colouring === "origin") return originClass(model, i);
  return colouring === "hover" ? `${scoreClass(score, theme)} from-${i}` : scoreClass(score, theme);
}

/** Each category's share of the whole, and of the categories that have scores. */
function shares(cats) {
  const total = sum(cats.map((c) => c.weight)) || 1;
  const scored = sum(cats.filter((c) => c.scores.length).map((c) => c.weight)) || 1;
  return { total, scored };
}

/* ---------- Bins ---------- */

/** An open bin: an area (dark, unless the theme is light; hatched while it has no scores) and its walls. */
function openBin(f, key, box, top, base, empty) {
  f.rects.push({ key, cls: "area--1 bin-area", x: box.x, y: top, w: box.w, h: base - top, hatch: empty });
  f.paths.push({ key: `${key}-walls`, cls: "bin", d: `M${box.x},${top - 10}V${base}H${box.x + box.w}V${top - 10}` });
}

/** The whole diagram as one closed area, once every category has melted into the grade. */
function wholeArea(f, area) {
  f.paths.push({ key: "whole-area", cls: "bin", d: `M${area.x},${area.top}H${area.x + area.w}V${area.base}H${area.x}Z` });
}

/** Lay categories across `area` by weight; each gets a box and the stretch inside it for its bars. */
function acrossByWeight(cats, area, gap = 14) {
  const { total } = shares(cats);
  let at = area.x;
  return cats.map((c) => {
    const w = (area.w * c.weight) / total;
    const box = { x: at + gap / 2, w: w - gap };
    at += w;
    return { c, box, inner: { x: box.x + 4, w: box.w - 8 } };
  });
}

/** The scores' grade written in the middle of an area. */
const gradeIn = (key, value, box, size, cls) => label(key, box.x + box.w / 2, box.y + box.h / 2, format(value), size, { cls, after: true });

/* ---------- 1. Histogram ---------- */

// Room on the left for the frequency axis.
const HIST = { x: 70, w: 550, top: 84, base: 440 };

/** How many of a category's scores sit at each level, 0 to 5. */
const frequencies = (c) => LEVELS.map((l) => c.scores.filter((s) => s.score === l).length);

function histogram(model, course, mode, { running = false, full = course, colouring = "rubric", theme = "dark", grow = null } = {}) {
  const { cats, final } = categoriesOf(model, course);
  const f = blank();
  f.texts.push(title(model));
  const room = HIST.base - HIST.top;
  // One score's height, fixed by the whole course so bars only grow as a semester unfolds.
  const most = Math.max(1, ...categoriesOf(model, full).cats.flatMap(frequencies));
  const unit = (room - 24) / most;
  const placed = acrossByWeight(cats, HIST, mode === "overall" ? 0 : 14);
  const origins = originsOf(model, course);

  // The frequency axis, on the left, with a mark at each count while the bars stand.
  f.texts.push({ key: "hist-freq", x: HIST.x - 40, y: (HIST.top + HIST.base) / 2, text: "Frequency", size: 13, anchor: "middle", cls: "label label--strong", rotate: -90 });
  if (mode === "fill") {
    const every = Math.ceil(most / 6);
    for (let n = 0; n <= most; n += every) {
      f.texts.push({ key: `hist-tick-${n}`, x: HIST.x - 8, y: HIST.base - n * unit, text: String(n), size: 11, anchor: "end", cls: "label label--small" });
    }
  }
  if (mode === "overall") wholeArea(f, HIST);

  placed.forEach(({ c, box, inner }) => {
    if (mode !== "overall") openBin(f, `hist-bin-${c.id}`, box, HIST.top, HIST.base, !c.scores.length);
    const slot = inner.w / LEVELS.length;
    const counts = frequencies(c);
    if (mode === "fill" && slot >= 9) {
      LEVELS.forEach((l) => f.texts.push({ key: `hist-lvl-${c.id}-${l}`, x: inner.x + (l + 0.5) * slot, y: HIST.base + 14, text: String(l), size: clamp(slot * 0.8, 8, 12), anchor: "middle", cls: "label label--small" }));
    }
    // Averaged, each level's bar becomes a layer of the bin (as thick as its share of the scores), all in the average's colour.
    const fillWith = mode === "overall" ? final : c.average;
    let y = HIST.base;
    LEVELS.forEach((l) => {
      const n = counts[l];
      const key = `hist-${c.id}-${l}`;
      if (mode === "fill") {
        const h = n * unit;
        const x = inner.x + l * slot + 1;
        if (colouring === "origin") {
          // The bar split by where its scores came from, always in the same order from the floor up.
          let top = HIST.base;
          origins.forEach((o, i) => {
            const k = c.scores.filter((s) => s.score === l && originId(model, s) === o.id).length;
            top -= k * unit;
            f.rects.push({ key: `${key}-${o.id}`, cls: `hist-bar ${originClass(model, i)}`, x, y: top, w: slot - 2, h: k * unit });
          });
        } else {
          f.rects.push({ key, cls: `hist-bar ${scoreClass(l, theme)}`, x, y: HIST.base - h, w: slot - 2, h });
        }
        if (n) f.texts.push({ key: `hist-n-${c.id}-${l}`, x: x + (slot - 2) / 2, y: HIST.base - h - 9, text: String(n), size: clamp(slot * 0.7, 8, 12), anchor: "middle", cls: "label on-dark" });
        // Above a bar that a growing score adds to.
        if (grow && c.scores.some((s) => s.score === l && grow.ids.has(s.copyOf ?? s.key))) {
          f.texts.push(growBadge(`${c.id}-${l}`, x + (slot - 2) / 2, HIST.base - h - 28, grow.times, "label label--strong on-dark"));
        }
        return;
      }
      if (!c.scores.length) return;
      const h = (n / c.scores.length) * room;
      y -= h;
      f.rects.push({ key, cls: "hist-bar", x: box.x, y, w: box.w, h, fill: scoreFill(fillWith, theme) });
    });
    if (mode === "within" && c.average !== null) {
      f.texts.push(gradeIn(`hist-avg-${c.id}`, c.average, { x: box.x, w: box.w, y: HIST.top, h: room }, Math.min(averageSize(c.weight / shares(cats).total), box.w / 2.4), onFill(theme)));
    }
    if (running && c.average !== null) {
      f.texts.push(label(`hist-run-lbl-${c.id}`, box.x + box.w / 2, HIST.top - 22, format(c.average), clamp(box.w / 5, 11, 16)));
    }
  });
  if (mode === "overall" && final !== null) f.texts.push(gradeIn("hist-final", final, { x: HIST.x, w: HIST.w, y: HIST.top, h: room }, 56, onFill(theme)));
  return f;
}

/* ---------- 2 & 3. Stacked bars ---------- */

const STACK = { x: 30, w: 580, top: 84, base: 466 };
const DROP = 60; // a new band drops onto its stack from this far above the bin
const HEADROOM = 32; // always full, a stack stops this far below the bin's top, leaving room for new scores to land
const LANDING = 22; // how high newly landed scores may stack in that room, so they stay well inside the bin

/** A category's scores as bands, in the order they arrived: a score and its copies (multiplied scores) make one band, `count` tall. */
function bandsOf(model, c) {
  const bands = new Map();
  c.scores.forEach((s) => {
    const key = s.copyOf ?? s.key;
    if (bands.has(key)) bands.get(key).count++;
    else bands.set(key, { key, score: s.score, order: s.order, origin: originId(model, s), count: 1 });
  });
  return [...bands.values()].sort((a, b) => a.order - b.order);
}

/**
 * Stacked bins. Full (`constant` false): each bin's stack always reaches the top, its bands sharing the height.
 * Filling up (`constant`): every score is the same height (set by the whole course), so a bin fills as scores arrive.
 * Either way a multiplied score's band is that many times taller, and the newest score sits on top.
 */
/**
 * Always full, a stack can leave a little room at the top of its bin (`HEADROOM`, with `landing` "gap"): newly
 * `arriving` scores (a set of score ids) land there, on top of the stack as it was, before the bin shares itself out
 * among them all.
 */
function stacked(model, course, mode, { running = false, full = course, constant = false, colouring = "rubric", theme = "dark", grow = null, arriving = null, landing = "full" } = {}) {
  const { cats, final } = categoriesOf(model, course);
  const index = originIndex(model, course);
  const f = blank();
  f.texts.push(title(model));
  const { total } = shares(cats);
  const room = STACK.base - STACK.top;
  const most = Math.max(1, ...categoriesOf(model, full).cats.map((c) => c.scores.length));
  const placed = acrossByWeight(cats, STACK, mode === "overall" ? 0 : 26);
  if (mode === "overall") wholeArea(f, STACK);
  placed.forEach(({ c, box }) => {
    const n = c.scores.length;
    if (mode !== "overall") openBin(f, `stack-bin-${c.id}`, box, STACK.top, STACK.base, !n);
    // Stacked from the floor up in the order the scores came in. Averaged, the bands fill the bin.
    // Always full, the stack reaches the headroom; scores arriving sit in the headroom, on top of the rest.
    const all = bandsOf(model, c);
    const isNew = (b) => mode === "fill" && arriving?.has(b.key);
    const settled = all.filter((b) => !isNew(b));
    const landed = all.filter(isNew);
    const stackRoom = mode === "fill" && !constant && landing === "gap" ? room - HEADROOM : room;
    const unit = mode === "fill" && constant ? room / most : stackRoom / Math.max(1, sum(settled.map((b) => b.count)));
    const landUnit = Math.min(unit, LANDING / Math.max(1, sum(landed.map((b) => b.count))));
    let y = STACK.base;
    // Coloured by origin, bands gather by origin, always in the same order from the floor up, so colours line up across bins.
    if (colouring === "origin") settled.sort((x, y) => index.get(x.origin) - index.get(y.origin) || x.order - y.order);
    [...settled, ...landed].forEach((b) => {
      const h = b.count * (isNew(b) ? landUnit : unit);
      y -= h;
      const band = { key: `band-${b.key}`, x: box.x, y, w: box.w, h, start: { x: box.x, y: STACK.top - DROP - h, w: box.w, h } };
      // Melting keeps the score's colour class, so its colour blends straight into the average's.
      const colour = `band ${colourOf(model, colouring, theme, b.score, index.get(b.origin))}`;
      if (mode === "fill") f.rects.push({ ...band, cls: colour });
      else f.rects.push({ ...band, cls: `${colour} band--melted`, fill: scoreFill(mode === "overall" ? final : c.average, theme) });
      if (grow?.ids.has(b.key)) f.texts.push(growBadge(b.key, box.x + box.w / 2, y + h / 2, grow.times));
    });
    if (c.average === null) return;
    if (mode === "within") f.texts.push(gradeIn(`stack-avg-${c.id}`, c.average, { x: box.x, w: box.w, y: STACK.top, h: room }, Math.min(averageSize(c.weight / total), box.w / 2.4), onFill(theme)));
    if (running && mode === "fill") f.texts.push(label(`stack-run-${c.id}`, box.x + box.w / 2, STACK.top - 22, format(c.average), clamp(box.w / 5, 11, 16)));
  });
  if (mode === "overall" && final !== null) f.texts.push(gradeIn("stack-final", final, { x: STACK.x, w: STACK.w, y: STACK.top, h: room }, 56, onFill(theme)));
  return f;
}

/* ---------- 4 & 5. Pie, radius by score, and ring, height by score ---------- */

// Large, with a thin weight ring: everything but the scores is kept quiet, so the scores are read first.
// Categories are parted by gaps `gap` wide all the way from the centre to the rim, so the pie reads as broken into
// its categories; once everything melts into the grade, the gaps close and the pie is whole.
export const PIE = { cx: 320, cy: 286, r: 170, gap: 10, ring: [182, 192], names: 204 };
const CENTRE = { x: PIE.cx, y: PIE.cy };
const ARC_POINTS = 24; // every shape has the same number of points, so any two can be animated between
const FULL_TURN = 2 * Math.PI;

const polar = (r, a) => [CENTRE.x + r * Math.sin(a), CENTRE.y - r * Math.cos(a)];
const points = (pts) => pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L");
const circle = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;

/**
 * A category's slice, parted from its neighbours: each edge moved `half` into the slice, so the gap is even.
 * Its point (`apex`) is where the two moved edges meet, on the middle of its angles.
 */
function parted(a0, a1, half) {
  const span = a1 - a0;
  const h = span < FULL_TURN - 1e-6 ? half : 0;
  const apexD = h ? h / Math.sin(span / 2) : 0;
  return { a0, a1, h, apexD, apex: polar(apexD, (a0 + a1) / 2) };
}

/** The angles a circle of radius r spans inside the parted slice, between b0 and b1. */
function within(slice, r, b0, b1) {
  const t = slice.h ? Math.asin(Math.min(1, slice.h / r)) : 0;
  const lo = Math.max(b0, slice.a0 + t);
  const hi = Math.min(b1, slice.a1 - t);
  return hi > lo ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
}

const arcPoints = (r, [lo, hi]) => Array.from({ length: ARC_POINTS + 1 }, (_, i) => polar(r, lo + ((hi - lo) * i) / ARC_POINTS));

/**
 * The piece of a parted slice between angles b0 and b1, out to radius r, as a polygon: from the slice's point or,
 * in a ring, from the inner circle (radius `inner`). Either way it has the same number of points.
 */
function piece(slice, r, b0, b1, inner = 0) {
  const rr = Math.max(r, slice.apexD + 1, inner + 1);
  const outer = arcPoints(rr, within(slice, rr, b0, b1));
  const base = inner > slice.apexD
    ? arcPoints(inner, within(slice, inner, b0, b1)).reverse()
    : Array.from({ length: ARC_POINTS + 1 }, () => slice.apex);
  return `M${points([...outer, ...base])}Z`;
}

/** An arc across a parted slice at radius r. */
const sliceArc = (slice, r) => `M${points(arcPoints(r, within(slice, r, slice.a0, slice.a1)))}`;

/** Each category's angles, from the top, clockwise. */
export function pieAngles(cats) {
  const { total } = shares(cats);
  let a = 0;
  return cats.map((c) => {
    const a0 = a;
    a += (FULL_TURN * c.weight) / total;
    return { c, a0, a1: a };
  });
}

/**
 * The weight ring around the pie: a segment per category and a handle on each inner edge, each category named
 * outside it with its weight and, beneath, its average (`averages`: none once everything has melted into the grade).
 */
function ring(f, slices, averages = true) {
  const { total } = shares(slices.map((s) => s.c));
  slices.forEach(({ c, a0, a1 }, i) => {
    f.paths.push({ key: `ring-${c.id}`, cls: `ring ring--${i % 2}`, d: `M${points([...arcPoints(PIE.ring[1], [a0, a1]), ...arcPoints(PIE.ring[0], [a0, a1]).reverse()])}Z` });
    const mid = (a0 + a1) / 2;
    const [x, y] = polar(PIE.names, mid);
    const side = Math.sin(mid);
    const anchor = side > 0.25 ? "start" : side < -0.25 ? "end" : "middle";
    // Two lines, kept clear of the ring: above it at the top, beside it at the sides, below it at the bottom.
    const up = Math.cos(mid);
    const top = up > 0.5 ? y - 18 : up < -0.5 ? y + 8 : y - 3;
    f.texts.push({ key: `ring-lbl-${c.id}`, x, y: top, text: `${c.name} · ${percent(c.weight / total)}`, size: 15, anchor, cls: "label" });
    if (averages && c.average !== null) {
      f.texts.push({ key: `ring-avg-${c.id}`, x, y: top + 17, text: `avg ${format(c.average)}`, size: 14, anchor, cls: "label label--strong" });
    }
    if (i < slices.length - 1) {
      const [hx, hy] = polar((PIE.ring[0] + PIE.ring[1]) / 2, a1);
      f.outlines.push({ key: `ring-handle-${i}`, cls: "ring-handle", d: circle(hx, hy, 6) });
    }
  });
}

/** The pie (`hole` 0), or a ring with an inner circle of radius `hole`, its pieces standing out from it. */
function rose(model, course, mode, { colouring = "rubric", grow = null, hole = 0 } = {}) {
  const { cats, final } = categoriesOf(model, course);
  const f = blank();
  f.texts.push(title(model));
  const slices = pieAngles(cats);
  const radius = (score) => hole + ((PIE.r - hole) * Math.max(score, 0.04)) / SCORE_MAX;
  const byOrigin = colouring === "origin" && mode === "fill";
  const index = originIndex(model, course);
  const half = mode === "overall" ? 0 : PIE.gap / 2;

  slices.forEach(({ c, a0, a1 }) => {
    const n = c.scores.length;
    const slice = parted(a0, a1, half);
    // Faint arcs across the slice at each grade, 1 to 5; its rim is a 5.
    for (let k = 1; k <= SCORE_MAX; k++) {
      f.outlines.push({ key: `rose-mark-${c.id}-${k}`, cls: k === SCORE_MAX ? "rose-rim" : "grade-mark", d: sliceArc(slice, radius(k)) });
    }
    if (!n) {
      f.paths.push({ key: `pie-empty-${c.id}`, cls: "slice", d: piece(slice, PIE.r, a0, a1, hole), hatch: true });
      return;
    }
    f.paths.push({ key: `rose-bg-${c.id}`, cls: "slice-bg", d: piece(slice, PIE.r, a0, a1, hole) });
    // Coloured by origin, a slice's pieces gather by origin, so each origin reads as one stretch of the slice.
    const scores = byOrigin ? [...c.scores].sort((a, b) => index.get(originId(model, a)) - index.get(originId(model, b)) || byArrival(a, b)) : c.scores;
    // A multiplied score and its copies (side by side in either order) make one piece, that many times as wide, with no lines inside it.
    const pieces = [];
    scores.forEach((s) => {
      const last = pieces.at(-1);
      if (last && (s.copyOf ?? s.key) === (last.s.copyOf ?? last.s.key)) last.count++;
      else pieces.push({ s, count: 1 });
    });
    let at = 0;
    pieces.forEach(({ s, count }) => {
      const b0 = a0 + ((a1 - a0) * at) / n;
      at += count;
      const b1 = a0 + ((a1 - a0) * at) / n;
      const value = mode === "fill" ? s.score : mode === "within" ? c.average : final;
      // The pie always takes the mellow rubric colours.
      // Melting keeps the score's colour class, so its colour blends straight into the average's (not through black).
      const colour = `slice ${colourOf(model, colouring, "light", s.score, index.get(originId(model, s)))}`;
      const cls = mode === "fill" ? colour : `${colour} slice--melted`;
      f.paths.push({ key: `slice-${s.key}`, cls, d: piece(slice, radius(value), b0, b1, hole), ...(mode === "fill" ? {} : { fill: scoreFill(value, "light") }) });
      if (grow?.ids.has(s.copyOf ?? s.key)) {
        const [x, y] = polar(hole ? (hole + radius(value)) / 2 : Math.max(radius(value) * 0.7, slice.apexD + 20), (b0 + b1) / 2);
        f.texts.push(growBadge(s.copyOf ?? s.key, x, y, grow.times));
      }
    });
  });
  if (mode === "overall" && final !== null) {
    f.texts.push(label("pie-final", PIE.cx, PIE.cy - radius(final) - 22, format(final), 32, { cls: "average", after: true }));
  }
  ring(f, slices, mode !== "overall");
  return f;
}

/* ---------- The variants ---------- */

/** A variant from a draw function (model, course, mode, options); `extra` options apply in every mode (a fixed `theme`, too). */
const variant = (draw, control, { colourings = false, themes = false, lands = false, ...extra } = {}) => ({
  control,
  lands,
  colourings,
  themes,
  theme: extra.theme,
  fill: (model, course, options) => draw(model, course, "fill", { ...options, ...extra }),
  within: (model, course, options) => draw(model, course, "within", { ...options, ...extra }),
  overall: (model, course, options) => [draw(model, course, "overall", { ...options, ...extra })],
});

// A pie's key sits beneath it, nearly as wide as the diagram.
const pieRing = { type: "ring", span: { top: PIE.cy - PIE.r, base: PIE.cy + PIE.r, across: { left: 30, right: VARIANT_VIEW.w - 30 } } };
const stackBar = { type: "bar", x: STACK.x, w: STACK.w, y: STACK.base, span: { top: STACK.top, base: STACK.base } };

export const VARIANTS = {
  histogram: variant(histogram, { type: "bar", x: HIST.x, w: HIST.w, y: HIST.base + 22, span: { top: HIST.top, base: HIST.base } }, { colourings: true, themes: true }),
  stacked: variant(stacked, stackBar, { colourings: true, theme: "light", lands: true }),
  filling: variant(stacked, stackBar, { constant: true, themes: true }),
  donut: variant(rose, pieRing, { colourings: true, hole: PIE.r / SCORE_MAX }),
};
