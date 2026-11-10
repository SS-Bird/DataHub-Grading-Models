// Scene layouts: one frame per scroll stage for each model, in the panel's viewBox.
// Frames are plain data ({ rects, paths, lines, links, tokens, outlines, texts }); chart.js animates between them.
// Frames also list drop `targets` (the categories a score can be dragged into), which chart.js ignores.
//
// Top of the panel: the example and the categories scores are sorted into.
// Bottom of the panel: the grade drawn as areas (AT: a closed rectangle; CO: open bins that grow).
// With `{ sized: true }`, both models are open bins of bars sized by score instead (see the sized section below).

import { assessmentTypeModel, coModel, format, percent, SCORE_MAX } from "./grading.js";
import { pastelFill } from "./palette.js";

export const VIEW = { w: 640, h: 760 };
export const STAGES = ["example", "replicate", "sort", "group", "frame", "subdivide", "fill", "melt1", "melt2", "final"];
const stageIndex = (name) => STAGES.indexOf(name);

// Scores leaving the timeline and dropping into the grade take their time.
const TIMING = {
  replicate: { ease: "pop" },
  sort: { ease: "smooth", duration: 2200, stagger: 70 },
  fill: { ease: "fall", duration: 2200, stagger: 70 },
};
const SANDBOX_TIMING = { ease: "pop", duration: 600, stagger: 0 };

const X0 = 40;
const W = 560;
/** The width the diagrams span across the panel (viewBox units). */
export const DIAGRAM_SPAN = { x: X0, w: W };
const AXIS_Y = 150;
const TOKEN = 26;
const BOXES = { y: 112, h: 210 };
const BOXES_BELOW_TIMELINE = { y: 380, h: 200 };
const SMALL = { top: 392, bottom: 744 };
const BIG = { top: 84, bottom: 744 };
const SANDBOX = { top: 170, bottom: 744 };
const SANDBOX_SIZED = { ...SANDBOX, x: X0 - 20, w: W - 30 }; // leaves room on the right for the grade to date
/** Where the sized sandbox's bins run across the panel (viewBox units), so controls can line up beneath them. */
export const SANDBOX_BINS = { x: SANDBOX_SIZED.x, w: SANDBOX_SIZED.w };
const BIN_HEIGHT = 0.85; // an empty bin's height, as a share of the room it can grow into
const CUBE_GAP = 0.11; // share of a cell left empty on each free side of a cube
const BIN_PAD = 8;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Text size of an average is proportional to the weight of its category. */
const averageSize = (weight) => clamp(80 * weight, 14, 80);

/** Once averaged, a category takes the pastel colour of its average, blended between rubric colours. */
const averaged = (average) => (average === null ? {} : { fill: pastelFill(average) });

const blank = () => ({ rects: [], paths: [], lines: [], links: [], tokens: [], outlines: [], texts: [], targets: [] });

function merge(...parts) {
  const frame = blank();
  for (const part of parts) {
    for (const k of Object.keys(frame)) frame[k].push(...(part[k] ?? []));
  }
  return frame;
}

const token = (s, x, y, size, extra = {}) => ({
  key: s.key, x, y, size, score: s.score, round: true,
  copy: s.copy ?? 0, copyOf: s.copyOf, from: s.copyOf, order: s.order, ...extra,
});

/**
 * Lay out scores on a grid of cells ({ s, col, row, x, y } with x/y the cell's top-left corner).
 * A score and its copies form one Tetris piece: their squares close the gap where they touch, so the colour runs
 * from one to the next. A score without copies stays a circle unless `cube` asks for cubes everywhere;
 * cubes (in the grade diagram) also get an outline around each piece.
 *   gap: space left on each free side of a square; rowsUp: row numbers increase upwards;
 *   squareCls: class for a square of a given score; after: outlines appear once the pieces have landed.
 */
function tetrisPieces(cells, cell, { gap, rowsUp = false, cube = false, squareCls = (s) => `token--score-${s.score}`, after = false, prefix = "piece" }) {
  const origin = (s) => s.copyOf ?? s.key;
  const count = new Map();
  cells.forEach((c) => count.set(origin(c.s), (count.get(origin(c.s)) ?? 0) + 1));
  const at = new Map(cells.map((c) => [`${c.col},${c.row}`, c]));
  const joined = (c, dc, dr) => {
    const other = at.get(`${c.col + dc},${c.row + dr}`);
    return other !== undefined && origin(other.s) === origin(c.s);
  };
  const up = rowsUp ? 1 : -1;
  const tokens = [];
  const edges = new Map();
  cells.forEach((c) => {
    if (!cube && count.get(origin(c.s)) === 1) {
      tokens.push(token(c.s, c.x + cell / 2, c.y + cell / 2, cell - 2 * gap));
      return;
    }
    const left = joined(c, -1, 0);
    const right = joined(c, 1, 0);
    const above = joined(c, 0, up);
    const below = joined(c, 0, -up);
    const x0 = c.x + (left ? 0 : gap);
    const x1 = c.x + cell - (right ? 0 : gap);
    const y0 = c.y + (above ? 0 : gap);
    const y1 = c.y + cell - (below ? 0 : gap);
    tokens.push(token(c.s, (x0 + x1) / 2, (y0 + y1) / 2, cell - 2 * gap, {
      w: x1 - x0, h: y1 - y0, cls: `${squareCls(c.s)}${cube ? "" : " token--joined"}`, round: false,
    }));
    if (!cube) return;
    const d = [
      left ? "" : `M${x0},${y0}V${y1}`,
      right ? "" : `M${x1},${y0}V${y1}`,
      above ? "" : `M${x0},${y0}H${x1}`,
      below ? "" : `M${x0},${y1}H${x1}`,
    ].join("");
    const key = origin(c.s);
    edges.set(key, { d: (edges.get(key)?.d ?? "") + d, order: c.s.order });
  });
  const outlines = [...edges].map(([key, e]) => ({ key: `${prefix}-${key}`, cls: "piece", d: e.d, order: e.order, after }));
  return { tokens, outlines };
}

const title = (text, view = VIEW) => ({ texts: [{ key: "title", x: view.w / 2, y: 36, text, size: 22, anchor: "middle", cls: "title" }] });

const averageText = (key, value, x, y, weight, cls = "") => ({
  key, x, y, text: format(value), size: averageSize(weight), anchor: "middle", cls: `average ${cls}`,
});

/** An average centred in its box if it fits, otherwise floating just above it (`aboveTone` styles it there). */
function placedAverage(key, value, box, weight, onTone = "", aboveTone = "") {
  const size = Math.min(averageSize(weight), Math.max(14, box.w / 2.6));
  const inside = size <= box.h * 0.8;
  const y = inside ? box.y + box.h / 2 : box.y - size / 2 - 8;
  return { ...averageText(key, value, box.x + box.w / 2, y, weight, inside ? onTone : aboveTone), size };
}

/** "Final grade" once every session has scores; until then it is the grade so far. */
function finalText(value, box, complete) {
  const final = placedAverage("final", value, box, 1);
  return [
    {
      key: "final-lbl", x: final.x, y: final.y - final.size / 2 - 14, text: complete ? "Final grade" : "Present grade",
      size: 16, anchor: "middle", cls: "label label--strong",
    },
    final,
  ];
}

/* ---------- Top: the example, then categories ---------- */

/** The sessions that have scores, along a line: classes above, assignments hanging below. */
function example(course, scores, multiplied, axisY = AXIS_Y) {
  const f = blank();
  const shown = multiplied ? scores : scores.filter((s) => !s.copyOf);
  const sessions = course.sessions.filter((session) => shown.some((s) => s.session === session.id));
  const spacing = W / Math.max(1, sessions.length);

  f.lines.push({ key: "axis", cls: "axis", x1: X0, y1: axisY, x2: X0 + W, y2: axisY });
  sessions.forEach((session, i) => {
    const x = X0 + spacing * (i + 0.5);
    const isClass = session.type === "class";
    const own = shown.filter((s) => s.session === session.id);
    const originals = own.filter((s) => !s.copyOf);
    const copies = Math.max(...own.map((s) => (s.copy ?? 0) + 1));

    // Classes keep full size unless crowded; assignments spread sideways beneath the line and shrink only if they must.
    const size = isClass
      ? clamp((spacing - 6) / copies - 4, 12, TOKEN)
      : clamp(Math.min(Math.min(spacing * 3, 220) / copies - 4, 170 / originals.length - 6), 12, TOKEN);
    const cell = size + 4;
    const half = (copies * cell) / 2;
    const cx = clamp(x, X0 + half, X0 + W - half);

    f.lines.push({ key: `stem-${session.id}`, cls: "stem", x1: x, y1: axisY, x2: x, y2: isClass ? axisY - 56 : axisY + 30 });
    // Each score sits on its own row, its copies joined beside it.
    originals.forEach((o, r) => {
      const y = isClass ? axisY - 56 - size / 2 : axisY + 34 + size / 2 + r * (size + 6);
      const row = own.filter((s) => s.id === o.id);
      const left = cx - (row.length * cell) / 2;
      const cells = row.map((s) => ({ s, col: s.copy ?? 0, row: 0, x: left + (s.copy ?? 0) * cell, y: y - cell / 2 }));
      const pieces = tetrisPieces(cells, cell, { gap: 2, prefix: "piece-ex" });
      f.tokens.push(...pieces.tokens);
      f.outlines.push(...pieces.outlines);
    });
  });
  return f;
}

/** Largest token size that fits every box's tokens into a box of this size. */
function fitSize(counts, box) {
  for (let size = 24; size > 6; size -= 1) {
    const cell = size + 5;
    const cols = Math.floor((box.w - 10) / cell);
    if (cols >= 1 && counts.every((n) => Math.ceil(n / cols) * cell <= box.h - 10)) return size;
  }
  return 6;
}

/** Pack scores into a box, row by row, snaking back and forth so a score's copies stay joined. */
function packInto(scores, box, size) {
  const cell = size + 5;
  const cols = Math.max(1, Math.floor((box.w - 10) / cell));
  const left = box.x + (box.w - cols * cell) / 2;
  const cells = scores.map((s, i) => {
    const row = Math.floor(i / cols);
    const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
    return { s, col, row, x: left + col * cell, y: box.y + 5 + row * cell };
  });
  return tetrisPieces(cells, cell, { gap: 2.5, after: true, prefix: "piece-cat" });
}

/** First-level categories as boxes. With `groups`, the boxes gather inside their group's container. */
function categories(cats, groups, area = BOXES) {
  const f = blank();
  const n = cats.length;
  const boxes = [];

  if (!groups) {
    const gap = 14;
    const w = (W - gap * (n - 1)) / n;
    cats.forEach((c, i) => boxes.push({ c, x: X0 + i * (w + gap), w }));
  } else {
    const inner = 8;
    const between = 28;
    const pad = 10;
    const w = (W - inner * (n - groups.length) - between * (groups.length - 1) - 2 * pad * groups.length) / n;
    let x = X0;
    groups.forEach((g) => {
      const start = x;
      x += pad;
      cats.filter((c) => g.members.includes(c.id)).forEach((c) => {
        boxes.push({ c, x, w });
        x += w + inner;
      });
      x += pad - inner;
      f.rects.push({ key: `grp-${g.id}`, cls: "container", x: start, y: area.y - 34, w: x - start, h: area.h + 44, rx: 12 });
      f.texts.push({ key: `grp-lbl-${g.id}`, x: (start + x) / 2, y: area.y - 46, text: g.name, size: 15, anchor: "middle", cls: "label label--group" });
      x += between;
    });
  }

  const size = fitSize(cats.map((c) => c.scores.length), { w: Math.min(...boxes.map((b) => b.w)), h: area.h });
  boxes.forEach(({ c, x, w }) => {
    const box = { x, y: area.y, w, h: area.h };
    f.rects.push({ key: `cat-${c.id}`, cls: "box", ...box, rx: 8, hatch: !c.scores.length });
    f.texts.push({ key: `cat-lbl-${c.id}`, x: x + w / 2, y: area.y - 12, text: c.name, size: 13, anchor: "middle", cls: "label" });
    const pieces = packInto(c.scores, box, size);
    f.tokens.push(...pieces.tokens);
    f.outlines.push(...pieces.outlines);
  });
  return f;
}

/** Timeline and categories together: the timeline fades, leaving a faint ghost of each score and a trail to where it went.
 * A score and its copies share one trail, thicker the more copies there are. */
function sortedFromTimeline(timeline, sorted) {
  const was = new Map(timeline.tokens.map((t) => [t.key, t]));
  const copies = groupBy(sorted.tokens.filter((t) => was.has(t.copyOf ?? t.key)), (t) => t.copyOf ?? t.key);
  return merge(sorted, {
    tokens: timeline.tokens.map((t) => ({ ...t, key: `ghost-${t.key}`, from: null, cls: "token--ghost" })),
    lines: [
      ...timeline.lines.map((l) => ({ ...l, cls: `${l.cls} ghost` })),
      ...[...copies].map(([origin, landed]) => ({
        key: `trail-${origin}`, cls: "trail", draw: true, order: landed[0].order, width: 1.2 * landed.length,
        x1: was.get(origin).x, y1: was.get(origin).y,
        x2: sum(landed.map((t) => t.x)) / landed.length, y2: sum(landed.map((t) => t.y)) / landed.length,
      })),
    ],
  });
}

/** Group items into a Map by key, keeping order. */
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/* ---------- Bottom: Assessment Type Model as a closed rectangle ---------- */

/** Split a box into n equal sections, side by side (`across`) or stacked, with small gaps between them. */
function sections(box, n, across, gap = 3) {
  const sw = across ? (box.w - gap * (n - 1)) / n : box.w;
  const sh = across ? box.h : (box.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const x = across ? box.x + i * (sw + gap) : box.x;
    const y = across ? box.y : box.y + i * (sh + gap);
    return { box: { x, y, w: sw, h: sh }, cx: x + sw / 2, cy: y + sh / 2, size: Math.min(sw, sh) };
  });
}

/** One pastel section per score inside a category's cell, with the score written on it. */
function scoreSections(f, t, tr, across = true) {
  // Sections sit inside the category's box, so its edge and label stay visible.
  const body = { x: tr.x + 6, y: tr.y + 22, w: tr.w - 12, h: Math.max(4, tr.h - 28) };
  sections(body, t.scores.length, across).forEach((sec, i) => {
    const s = t.scores[i];
    f.rects.push({ key: `sec-${s.key}`, cls: `section pastel--${s.score}`, ...sec.box, order: s.order });
    f.tokens.push(token(s, sec.cx, sec.cy, clamp(sec.size * 0.6, 10, 40), { cls: "token--bare", round: false }));
  });
}

function atGrade(result, stage, area, complete) {
  const L = stageIndex(stage);
  const f = blank();
  if (L < stageIndex("frame")) return f;

  const H = area.bottom - area.top;
  const total = sum(result.types.map((t) => t.weight)) || 1;
  const counted = sum(result.types.filter((t) => t.scores.length).map((t) => t.weight));
  // When averages combine, categories without scores drop out: their area is cut away, not handed to the others.
  const whole = { x: X0, y: area.top, w: W, h: (H * counted) / total };
  const merged = L >= stageIndex("melt2");
  const isFinal = L >= stageIndex("final");
  let x = X0;

  result.groups.forEach((g, gi) => {
    const gr = { x, y: area.top, w: (W * g.weight) / total, h: H };
    x += gr.w;
    if (gr.w <= 0) return;
    const onTone = gi % 2 ? "on-dark" : "";
    const inner = { x: gr.x + 6, y: gr.y + 32, w: gr.w - 12, h: gr.h - 38 };

    let y = inner.y;
    const rows = g.types.map((t) => {
      const tr = { x: inner.x, y, w: inner.w, h: ((inner.h - 4 * (g.types.length - 1)) * t.weight) / (g.weight || 1) };
      y += tr.h + 4;
      return { t, tr };
    });
    // Sections run the way a cell would be longer if its group's weight were shared equally, so changing a
    // category's weight only stretches its sections and never turns them.
    const across = inner.w >= inner.h / g.types.length;
    const scored = rows.filter((r) => r.t.scores.length);
    const groupCounted = sum(scored.map((r) => r.t.weight));
    const kept = { ...inner, h: scored.length ? sum(scored.map((r) => r.tr.h)) + 4 * (scored.length - 1) : 0 };
    const box = merged ? { ...gr, h: scored.length ? kept.h + 38 : 0 } : gr;

    if (isFinal) {
      f.rects.push({ key: `g-${g.id}`, cls: "area--whole", ...whole, ...averaged(result.final) });
      return;
    }
    f.rects.push({ key: `g-${g.id}`, cls: `area--${gi % 2}`, ...box, opacity: box.h ? 1 : 0 });
    if (box.h) {
      f.texts.push({ key: `g-lbl-${g.id}`, x: gr.x + 10, y: gr.y + 20, text: `${g.name} · ${percent(merged ? groupCounted : g.weight)}`, size: 13, cls: `label label--strong ${onTone}` });
    }
    if (L < stageIndex("subdivide")) return;

    rows.forEach(({ t, tr }) => {
      if (merged) {
        // Scored categories melt together; an undone one shrinks away.
        f.rects.push(t.scores.length
          ? { key: `t-${t.id}`, cls: "cell", rx: 4, ...kept, ...averaged(g.average) }
          : { key: `t-${t.id}`, cls: "cell", rx: 4, ...tr, h: 0, opacity: 0, hatch: true });
        return;
      }
      const isAveraged = L === stageIndex("melt1");
      f.rects.push({ key: `t-${t.id}`, cls: "cell", rx: 4, ...tr, hatch: !t.scores.length, ...(isAveraged ? averaged(t.average) : {}) });
      f.targets.push({ kind: "type", id: t.id, ...tr });

      if (g.types.length > 1) {
        f.texts.push({ key: `t-lbl-${t.id}`, x: tr.x + 8, y: tr.y + 12, text: `${t.shortName} · ${percent(t.weight)}`, size: 11, cls: "label label--small" });
      }
      if (L === stageIndex("fill")) scoreSections(f, t, tr, across);
      if (isAveraged && t.average !== null) {
        f.texts.push(placedAverage(`avg-${t.id}`, t.average, tr, t.weight));
      }
    });
    if (merged && g.average !== null) {
      f.texts.push(placedAverage(`gavg-${g.id}`, g.average, kept, groupCounted));
    }
  });

  if (isFinal && result.final !== null) f.texts.push(...finalText(result.final, whole, complete));
  return f;
}

/* ---------- Bottom: CO Model as open bins (one per CO) of cubes ---------- */

/**
 * Share a bin's columns of cubes out among its LOs, side by side with no gap, so each LO's cubes keep to their
 * own area without it being marked.
 */
function loAreas(b, size) {
  const n = b.co.los.length;
  const cols = Math.floor((b.w - 2 * BIN_PAD) / size);
  const left = b.x + (b.w - cols * size) / 2;
  let col = 0;
  return b.co.los.map((lo, k) => {
    const own = Math.floor(cols / n) + (k < cols % n ? 1 : 0);
    const area = { lo, cols: own, x: left + col * size, w: own * size };
    col += own;
    return area;
  });
}

/** Largest cube size that gives every LO a column and keeps its stack within the available height. */
function cubeSize(bins, maxH) {
  for (let size = 72; size > 8; size -= 1) {
    const fits = bins.every((b) => Math.floor((b.w - 2 * BIN_PAD) / size) >= b.co.los.length
      && loAreas(b, size).every((a) => Math.ceil(a.lo.scores.length / a.cols) * size <= maxH));
    if (fits) return size;
  }
  return 8;
}

/** Cells snaking up from the floor of a run of columns: left to right, then right to left, so copies stay side by side. */
function stack(scores, x, cols, size, base) {
  return scores.map((s, i) => {
    const row = Math.floor(i / cols);
    const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
    return { s, col, row, x: x + col * size, y: base - 3 - (row + 1) * size };
  });
}

/** An open-topped bin outline. */
const binPath = (x, top, w, bottom) => `M${x},${top}V${bottom}H${x + w}V${top}`;

/** With `fixedBins`, bins keep one height and only their widths follow the weights (cubes shrink to fit instead). */
function coGrade(result, stage, area, loShort, complete, fixedBins = false) {
  const L = stageIndex(stage);
  const f = blank();
  if (L < stageIndex("frame")) return f;

  const base = area.bottom - 30;
  const maxH = base - area.top;
  const total = sum(result.outcomes.map((o) => o.weight)) || 1;
  const gap = 14;
  const headroom = 44; // space above the tallest LO stack for its label
  let x = X0;
  const bins = result.outcomes.map((co) => {
    const w = (W * co.weight) / total;
    const bin = { co, x: x + gap / 2, w: w - gap };
    x += w;
    return bin;
  }).filter((b) => b.w > 0);
  if (!bins.length) return f;

  // Cubes stack from the floor of their LO's area of the bin.
  // Bins start tall and only grow taller once their cubes need the room; all bins stay the same height.
  const size = cubeSize(bins, (fixedBins ? maxH * BIN_HEIGHT : maxH) - headroom);
  bins.forEach((b) => {
    b.subs = loAreas(b, size);
    b.subs.forEach((sub) => {
      sub.cells = stack(sub.lo.scores, sub.x, sub.cols, size, base);
    });
    b.cells = b.subs.flatMap((sub) => sub.cells);
    // Once melting, the LOs' stacks settle into one pile across the whole bin, so they don't stand as separate bars.
    const cols = sum(b.subs.map((sub) => sub.cols));
    b.pile = stack(b.cells.map((c) => c.s), b.subs[0].x, cols, size, base);
  });
  const tallest = Math.max(...bins.flatMap((b) => b.subs.map((sub) => Math.ceil(sub.lo.scores.length / sub.cols) * size)));
  const binH = fixedBins ? maxH * BIN_HEIGHT : Math.max(maxH * BIN_HEIGHT, tallest + headroom);
  bins.forEach((b) => {
    b.h = binH;
    b.wall = binH - 26;
  });

  // In the final step, bins without scores drop out and the rest melt into one.
  const isFinal = L >= stageIndex("final");
  const scoredBins = bins.filter((b) => b.co.scores.length);
  const whole = scoredBins.length && {
    x: scoredBins[0].x,
    w: sum(scoredBins.map((b) => b.w)) + gap * (scoredBins.length - 1),
    h: binH,
  };

  bins.forEach((b, i) => {
    if (isFinal && !b.co.scores.length) return;
    const onTone = i % 2 && !isFinal ? "on-dark" : "";
    const h = isFinal ? whole.h : b.h;
    const box = isFinal ? { x: whole.x, w: whole.w } : { x: b.x, w: b.w };
    const top = base - h;
    const tone = isFinal ? averaged(result.final) : {};

    f.rects.push({ key: `bin-${b.co.id}`, cls: isFinal ? "area--whole" : `area--${i % 2}`, x: box.x, y: top, w: box.w, h, hatch: !isFinal && !b.co.scores.length, ...tone });
    f.paths.push({ key: `binline-${b.co.id}`, cls: "bin", d: binPath(box.x, top - 18, box.w, base) });
    if (isFinal) return;
    f.texts.push({ key: `bin-lbl-${b.co.id}`, x: b.x + b.w / 2, y: base + 34, text: `${b.co.name} · ${percent(b.co.weight)}`, size: 13, anchor: "middle", cls: "label label--strong" });

    if (L >= stageIndex("subdivide") && L <= stageIndex("fill")) {
      b.subs.forEach((sub) => {
        const { lo } = sub;
        const subTop = base - b.wall;
        f.texts.push({ key: `lo-lbl-${lo.id}`, x: sub.x + sub.w / 2, y: base + 16, text: loShort[lo.id] ?? lo.name, size: clamp(sub.w / 6, 9, 12), anchor: "middle", cls: "label label--small" });
        f.targets.push({ kind: "lo", id: lo.id, x: sub.x, y: subTop, w: sub.w, h: b.wall });

        if (L === stageIndex("fill")) {
          // Copies join into one block of colour; no outline is drawn around them.
          const pieces = tetrisPieces(sub.cells, size, {
            gap: size * CUBE_GAP, rowsUp: true, cube: true, squareCls: (s) => `token--cube pastel--${s.score}`, after: true, prefix: "piece-grade",
          });
          f.tokens.push(...pieces.tokens);
        }
      });
    }

    // The cubes settle into one pile and melt into the CO's simple average.
    // Next, each CO's pile settles into a rectangle as wide as its bin; every CO's rectangle is the same height,
    // so its area is its weight. Each cube's cell becomes one vertical strip of that rectangle.
    if ((L === stageIndex("melt1") || L === stageIndex("melt2")) && b.co.average !== null) {
      const settled = L === stageIndex("melt2");
      const rect = { x: b.x + 4, y: top + 4, w: b.w - 8, h: h - 7 };
      const strip = rect.w / b.pile.length;
      b.pile.forEach((c, k) => {
        // Pieces overlap by a pixel so neighbouring cells and strips read as one block.
        const shape = settled
          ? { x: rect.x + k * strip, y: rect.y, w: Math.min(strip + 1, rect.x + rect.w - (rect.x + k * strip)), h: rect.h }
          : { x: c.x, y: c.y, w: size + 1, h: size + 1 };
        f.rects.push({ key: `melt-${c.s.key}`, cls: "cell melt", ...shape, ...averaged(b.co.average) });
      });
      const xs = b.pile.map((c) => c.x);
      const ys = b.pile.map((c) => c.y);
      const footprint = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) + size - Math.min(...xs), h: Math.max(...ys) + size - Math.min(...ys) };
      // While the shape is still ragged, its average floats just above it; once settled, it sits inside.
      f.texts.push(placedAverage(`coavg-${b.co.id}`, b.co.average, settled ? rect : { ...footprint, h: 0 }, b.co.weight, "", onTone));
    }
  });

  if (isFinal && whole && result.final !== null) {
    f.texts.push(...finalText(result.final, { x: whole.x, y: base - whole.h, w: whole.w, h: whole.h }, complete));
  }
  return f;
}

/* ---------- Sized scores: both models as open bins (a variant to compare) ---------- */

// Each category is its own bin, as wide as its weight. Each score is a bar as tall as its value (a 0 has no height,
// a 4 is twice a 2), and a bin's bars share its floor, so when they melt they level out at the bin's simple average;
// bins melting together level out at their weighted average, because each is as wide as its weight.
// The timeline stays at the top and the diagram keeps one size beneath it: bins appear, those without scores yet are
// cut away (the rest close up in the middle), then a bar grows in each bin for every score, in order, joined to it on
// the timeline by a faint line. Once the scores are in, the timeline leaves and the diagram grows, keeping its shape.

export const SIZED_STAGES = ["example", "replicate", "frame", "cut", "fill", "melt", "final"];
const sizedIndex = (name) => SIZED_STAGES.indexOf(name);
const SIZED_TIMING = {
  replicate: { ease: "pop" },
  fill: { ease: "smooth", duration: 1400, stagger: 40 },
  melt: { ease: "smooth", duration: 1600, stagger: 0 },
};
const SIZED_AXIS = 132;
const LABELS = { above: 28, below: 44 }; // room above a bin's walls and below its floor
const ASPECT = W / (744 - LABELS.below - (184 + LABELS.above)); // the full-size bins' width to height
const UNLABELLED_FLOOR = 2; // room below the floor of bins drawn without labels: just their walls

// The Understanding page's diagram on its own: a little shorter and wider than the full-size one, just under its title,
// with no labels beneath its floor; the page's weight bars sit there instead and name its bins.
const ALONE = { x: 20, w: 600, top: 64, bottom: 664 };

/**
 * How the Understanding page lays out a diagram on its own: the panel's viewBox (`view`), where the bins sit (`alone`),
 * and where the trajectory staircase sits (`stairs`: its left, width, top of the whole grade, and floor).
 * TALL is the usual panel; SQUAT is a much wider, shorter one (tried for the Assessment Type Model).
 */
export const TALL = { view: VIEW, alone: ALONE, stairs: { x: X0, w: W, top: 110, base: 700 } };
export const SQUAT = {
  view: { w: 1040, h: 420 },
  alone: { x: 20, w: 1000, top: 56, bottom: 320 },
  stairs: { x: 60, w: 920, top: 70, base: 360 },
};

/** Where a layout's sized bins sit in its panel: across, the top of their walls, and their floor. */
export const spanOf = ({ alone }) => ({ x: alone.x, w: alone.w, top: alone.top + LABELS.above - 12, base: alone.bottom - UNLABELLED_FLOOR });
export const ALONE_SPAN = spanOf(TALL);

/** An area ({ x, w, top, bottom }) whose bins keep the full-size diagram's shape, centred across the panel. */
function sizedArea(top, bottom = 744) {
  const w = Math.min(W, (bottom - LABELS.below - (top + LABELS.above)) * ASPECT);
  return { x: X0 + (W - w) / 2, w, top, bottom };
}
const BENEATH_TIMELINE = sizedArea(372);
const FULL_SIZE = sizedArea(184);
const CALC_Y = { beneathTimeline: 318, fullSize: 132 }; // the calculation's middle line, above each size of diagram

const BIN_GAP = 14;
const BAR_GAP = 2;

/** Room for the bins: their floor, the top of their walls, and the height of one point of score. */
function binSpace(area, below = LABELS.below) {
  const base = area.bottom - below;
  const top = area.top + LABELS.above;
  return { base, top, unit: (base - top - 16) / SCORE_MAX };
}

/** Lay items side by side from `x`, each `scale` wide per unit of weight, with `gap` between them. */
function across(items, x, scale, gap) {
  let at = x;
  return items.map((item) => {
    const w = scale * item.weight;
    const box = { x: at + gap / 2, w: Math.max(0, w - gap) };
    at += w;
    return { item, box };
  });
}

/** Equal slots across a bin's floor, one per entry; an entry of null keeps its slot empty. */
function slots(entries, box) {
  const w = box.w / Math.max(1, entries.length);
  return entries.map((s, i) => ({ s, x: box.x + i * w, w }));
}

/** A bar per filled slot, as tall as its score. A score's copies touch with square corners, so they read as one block. */
function bars(cells, base, unit) {
  const origin = (c) => (c?.s ? c.s.copyOf ?? c.s.key : null);
  return cells.flatMap((c, i) => {
    if (!c.s) return [];
    const left = origin(cells[i - 1]) === origin(c) ? 0 : BAR_GAP / 2;
    const right = origin(cells[i + 1]) === origin(c) ? 0 : BAR_GAP / 2;
    const w = Math.max(1, c.w - left - right);
    const h = c.s.score * unit;
    return [token(c.s, c.x + left + w / 2, base - h / 2, Math.min(w, 30), {
      w, h, round: false, text: "", cls: `token--cube pastel--${c.s.score}`, ...(left && right ? {} : { rx: 0 }),
    })];
  });
}

/** The bars melted and levelled at `level`: each keeps its strip of the floor, growing out of its bar's shape. */
function water(cells, base, unit, level) {
  const h = level * unit;
  return cells.map((c) => ({
    key: `melt-${c.s.key}`, cls: "cell melt", x: c.x, y: base - h, w: c.w + 1, h, ...averaged(level),
    start: { x: c.x, y: base - c.s.score * unit, w: c.w, h: c.s.score * unit },
  }));
}

/** An open bin: a tinted area and the walls around it. */
function openBin(f, key, box, top, base, { cls, hatch = false }) {
  f.rects.push({ key, cls, x: box.x, y: top, w: box.w, h: base - top, hatch });
  f.paths.push({ key: `${key}-walls`, cls: "bin", d: binPath(box.x, top - 12, box.w, base) });
}

/** A faint "2×" over each score counted more than once, across its joined bars. */
function multiplierLabels(barTokens) {
  return [...groupBy(barTokens, (t) => t.copyOf ?? t.key)].filter(([, g]) => g.length > 1).map(([key, g]) => {
    const left = Math.min(...g.map((t) => t.x - t.w / 2));
    const right = Math.max(...g.map((t) => t.x + t.w / 2));
    const top = Math.min(...g.map((t) => t.y - t.h / 2));
    return {
      key: `mult-${key}`, x: (left + right) / 2, y: top - 7, text: `${g.length}×`, size: clamp((right - left) / 2.2, 4, 11),
      anchor: "middle", cls: "label label--small label--faint", order: g[0].order,
    };
  });
}

/** Text level with the top of a bin's melted scores, for `placedAverage`. */
const levelBox = (inner, base, unit, value) => ({ x: inner.x, y: base - value * unit, w: inner.w, h: value * unit });

/**
 * The sized diagram at one of SIZED_STAGES. `cats` are the bins: { id, name, weight, average, entries, spans? },
 * with `entries` the scores in floor order (null keeps an empty slot) and `spans` ({ id, name, count }) runs of
 * entries named under the floor (the CO model's LOs). `area` may set `x` and `w` (the panel's width otherwise).
 *   keepEmpty: keep bins without scores (no cutting); multipliers: label scores counted more than once;
 *   gradeLine: a line across the bins at the height of the grade to date;
 *   labels: false leaves the bins and their LOs unnamed, and puts their floor on the bottom of the area.
 */
function sizedBins(cats, final, stage, area, complete, { keepEmpty = false, kind, multipliers = false, gradeLine = false, labels = true }) {
  const L = sizedIndex(stage);
  const f = blank();
  if (L < sizedIndex("frame")) return f;

  const { base, top, unit } = binSpace(area, labels ? LABELS.below : UNLABELLED_FLOOR);
  const x = area.x ?? X0;
  const w = area.w ?? W;
  const total = sum(cats.map((c) => c.weight)) || 1;
  const isFinal = L >= sizedIndex("final");
  const kept = !keepEmpty && L >= sizedIndex("cut") ? cats.filter((c) => c.average !== null) : cats;
  // Bins cut away leave the rest centred, still as wide as their weight.
  const keptW = (w * sum(kept.map((c) => c.weight))) / total;
  const placed = across(kept, x + (w - keptW) / 2, w / total, isFinal ? 0 : BIN_GAP);
  if (!placed.length) return f;
  const scoresOf = (c) => c.entries.filter(Boolean);

  // In the final step the bins melt into one.
  if (isFinal) {
    const box = { x: placed[0].box.x, w: sum(placed.map((p) => p.box.w)) };
    openBin(f, `bin-${kept[0].id}`, box, top, base, { cls: "area--whole" });
    if (final !== null) {
      f.rects.push(...water(placed.flatMap(({ item: c, box: b }) => slots(scoresOf(c), b)), base, unit, final));
      f.texts.push(...finalText(final, levelBox(box, base, unit, final), complete));
    }
    return f;
  }

  placed.forEach(({ item: c, box }) => {
    const inner = { x: box.x + 6, w: box.w - 12 };
    // Every bin is dark; one without scores yet is hatched instead.
    openBin(f, `bin-${c.id}`, box, top, base, { cls: "area--1", hatch: c.average === null });
    if (labels) f.texts.push({
      key: `bin-lbl-${c.id}`, x: box.x + box.w / 2, y: base + (c.spans ? 34 : 18), text: `${c.name} · ${percent(c.weight)}`,
      size: clamp(box.w / 7, 9, 13), anchor: "middle", cls: "label label--strong",
    });

    if (L <= sizedIndex("fill")) {
      const cells = slots(c.entries, inner);
      // Spans (LOs) keep to their own stretch of the floor, named under it, above the bin's name.
      let k = 0;
      (c.spans ?? []).forEach((span) => {
        const run = { x: cells[k].x, w: span.count * cells[k].w };
        k += span.count;
        if (labels) f.texts.push({ key: `lo-lbl-${span.id}`, x: run.x + run.w / 2, y: base + 16, text: span.name, size: clamp(run.w / 6, 9, 12), anchor: "middle", cls: "label label--small" });
        f.targets.push({ kind, id: span.id, x: run.x, y: top, w: run.w, h: base - top });
      });
      if (!c.spans) f.targets.push({ kind, id: c.id, x: box.x, y: top, w: box.w, h: base - top });
      if (L === sizedIndex("fill")) {
        const own = bars(cells, base, unit);
        f.tokens.push(...own);
        if (multipliers) f.texts.push(...multiplierLabels(own));
      }
    }

    if (L >= sizedIndex("melt") && c.average !== null) {
      f.rects.push(...water(slots(scoresOf(c), inner), base, unit, c.average));
      f.texts.push(placedAverage(`avg-${c.id}`, c.average, levelBox(inner, base, unit, c.average), c.weight, "", "on-dark"));
    }
  });

  if (gradeLine && final !== null) {
    const y = base - final * unit;
    const right = placed.at(-1).box.x + placed.at(-1).box.w;
    f.outlines.push({ key: "grade-line", cls: "grade-line", d: `M${placed[0].box.x - 6},${y}H${right + 6}` });
    // Written just outside the bins, on the right, so it can be read whatever is behind the line.
    f.texts.push({ key: "grade-line-lbl", x: right + 10, y, text: format(final), size: 16, anchor: "start", cls: "label label--strong" });
  }
  return f;
}

/* The calculation, written between the timeline and the bins (above the bins once the timeline has gone):
   weight(…) + weight(…) = grade, filled in stage by stage like the bins. Each bracket first stands empty, then holds
   its bin's scores over their count, then their average; weights that no longer add up to 1 are divided out beneath
   a bar; the grade appears last. Pieces keep their keys from stage to stage, so they slide as the brackets fill. */

const CALC_SIZE = 20;
// Characters' widths as a share of the font size (digits are tabular; brackets and points are narrow).
const charWidth = (ch) => ({ "(": 0.34, ")": 0.34, ".": 0.28 })[ch] ?? 0.58;
const textWidth = (text) => [...text].reduce((w, ch) => w + charWidth(ch), 0);
const decimal = (w) => String(Number(w.toFixed(2)));

/**
 * The calculation for `cats` (as for sizedBins) at a sized stage, centred on line `y`.
 * Returns the frame, where each score's number sits (`numbers`, by score key) and where each bin's part of the sum
 * ends below (`terms`, by category id), for the faint lines that join them to the timeline and to the bins.
 */
function calculation(cats, final, stage, y) {
  const L = sizedIndex(stage);
  const result = { frame: blank(), numbers: new Map(), terms: new Map() };
  const kept = L >= sizedIndex("cut") ? cats.filter((c) => c.average !== null) : cats;
  if (L < sizedIndex("frame") || !kept.length) return result;
  const show = L >= sizedIndex("melt") ? "averages" : L === sizedIndex("fill") ? "scores" : "empty";
  const total = sum(kept.map((c) => c.weight));
  const divided = Math.abs(total - 1) > 0.005;

  // Lay the pieces out in ems from the left, then size the text so the whole line fits the panel.
  const pieces = []; // { key, text, at (em, centre), row: "mid" | "num" | "den", scale, order }
  const bars = []; // { key, from, to } in ems, under a bracket's scores
  const spans = []; // { id, from, to, deep } in ems: each bin's part of the sum
  let at = 0;
  const put = (key, text, { row = "mid", scale = 1, pad = 0.12, order = 0 } = {}) => {
    const w = textWidth(text) * scale;
    pieces.push({ key, text, at: at + pad + w / 2, row, scale, order });
    at += w + 2 * pad;
  };
  kept.forEach((c, i) => {
    if (i) put(`calc-op-${c.id}`, "+", { pad: 0.35 });
    const start = at;
    put(`calc-w-${c.id}`, decimal(c.weight));
    put(`calc-open-${c.id}`, "(", { pad: 0.04 });
    const scores = c.entries.filter(Boolean);
    if (show === "empty") {
      at += 2;
    } else if (show === "averages") {
      put(`calc-in-${c.id}`, format(c.average));
    } else {
      const left = at;
      scores.forEach((sc, j) => {
        put(`calc-num-${sc.key}`, String(sc.score), { row: "num", scale: 0.8, pad: 0.02, order: sc.order });
        if (j < scores.length - 1) put(`calc-plus-${sc.key}`, "+", { row: "num", scale: 0.8, pad: 0.04, order: sc.order });
      });
      pieces.push({ key: `calc-den-${c.id}`, text: String(scores.length), at: (left + at) / 2, row: "den", scale: 0.8, order: 0 });
      bars.push({ key: `calc-bar-${c.id}`, from: left, to: at });
    }
    put(`calc-close-${c.id}`, ")", { pad: 0.04 });
    spans.push({ id: c.id, from: start, to: at, deep: show === "scores" });
  });
  const sumEnd = at;
  put("calc-eq", "=", { pad: 0.4 });
  const done = L >= sizedIndex("final") && final !== null;
  if (done) put("calc-result", format(final));
  else at += 2;

  const size = Math.min(CALC_SIZE, W / at);
  const x0 = VIEW.w / 2 - (at * size) / 2;
  const X = (em) => x0 + em * size;
  const rowY = { mid: y, num: y - 0.62 * size, den: y + 0.62 * size };
  const f = result.frame;
  pieces.forEach((p) => {
    const strong = p.key === "calc-result" ? " calc-text--result" : "";
    f.texts.push({ key: p.key, x: X(p.at), y: rowY[p.row], text: p.text, size: size * p.scale, anchor: "middle", cls: `calc-text${strong}`, order: p.order });
    if (p.row === "num") result.numbers.set(p.key.replace("calc-num-", ""), { x: X(p.at), y: rowY.num - 0.5 * size, order: p.order });
  });
  bars.forEach((b) => f.lines.push({ key: b.key, cls: "calc-bar", x1: X(b.from), y1: y, x2: X(b.to), y2: y }));
  if (divided) {
    // The sum over its total weight, beneath a bar.
    f.lines.push({ key: "calc-outer-bar", cls: "calc-bar", x1: X(0), y1: y + 1.35 * size, x2: X(sumEnd), y2: y + 1.35 * size });
    f.texts.push({ key: "calc-outer-den", x: X(sumEnd / 2), y: y + 2 * size, text: decimal(total), size, anchor: "middle", cls: "calc-text" });
  }
  spans.forEach((sp) => result.terms.set(sp.id, { x: X((sp.from + sp.to) / 2), y: y + (sp.deep ? 1.05 : 0.6) * size }));
  return result;
}

/** The timeline's scores get keys of their own, so the bars can grow in place while the timeline stays. */
function onTimeline(frame) {
  const key = (k) => k && `tl-${k}`;
  return { ...frame, tokens: frame.tokens.map((t) => ({ ...t, key: key(t.key), from: key(t.from) })) };
}

/** The timeline moved up and faded, so it scrolls away as the diagram grows into its place. */
function scrolledAway(frame, dy = -240) {
  return {
    ...frame,
    tokens: frame.tokens.map((t) => ({ ...t, y: t.y + dy, opacity: 0 })),
    lines: frame.lines.map((l) => ({ ...l, y1: l.y1 + dy, y2: l.y2 + dy, opacity: 0 })),
  };
}

/**
 * The sized demonstration: the timeline above, the calculation, and the diagram below. As the scores come in, each
 * score's faint line runs from the timeline to its number in the calculation, and each bin's from its part of the sum.
 */
function sizedDemo(stage, name, ex, bins, cats, final) {
  const L = sizedIndex(stage);
  if (L >= sizedIndex("melt")) {
    const away = L === sizedIndex("melt") ? scrolledAway(onTimeline(ex(true, SIZED_AXIS))) : {};
    const calc = calculation(cats, final, stage, CALC_Y.fullSize);
    return { ...merge(title(name), away, bins(stage, FULL_SIZE, {}), calc.frame), ...SIZED_TIMING[stage] };
  }
  const timeline = onTimeline(ex(L >= sizedIndex("replicate"), SIZED_AXIS));
  const diagram = bins(stage, BENEATH_TIMELINE, { multipliers: true });
  const calc = calculation(cats, final, stage, CALC_Y.beneathTimeline);
  const lines = [];
  if (L === sizedIndex("fill")) {
    const at = new Map(timeline.tokens.map((t) => [t.key, t]));
    calc.numbers.forEach((n, key) => {
      const t = at.get(`tl-${key}`);
      if (t) lines.push({ key: `trail-${key}`, cls: "trail", draw: true, order: n.order, x1: t.x, y1: t.y, x2: n.x, y2: n.y });
    });
    calc.terms.forEach((term, id) => {
      const bin = diagram.rects.find((r) => r.key === `bin-${id}`);
      if (bin) lines.push({ key: `binline-${id}`, cls: "trail", draw: true, after: true, x1: bin.x + bin.w / 2, y1: bin.y - 12, x2: term.x, y2: term.y });
    });
  }
  // Scores come in one after another, quicker when there are many.
  const stagger = Math.min(160, 2800 / Math.max(1, calc.numbers.size));
  return { ...merge(title(name), timeline, calc.frame, diagram, { lines }), ...SIZED_TIMING[stage], ...(L === sizedIndex("fill") ? { stagger } : {}) };
}

/* ---------- Frames ---------- */

const isComplete = (course) => course.sessions.every((session) => course.scores.some((s) => s.session === session.id));

/** The grade so far, written above a diagram that is filled with scores but not yet averaged. */
function gradeHeader(final, complete) {
  if (final === null) return {};
  return {
    texts: [
      { key: "sandbox-lbl", x: VIEW.w / 2, y: 78, text: complete ? "Final grade" : "Present grade", size: 16, anchor: "middle", cls: "label label--strong" },
      { key: "sandbox-grade", x: VIEW.w / 2, y: 120, text: format(final), size: 48, anchor: "middle", cls: "average" },
    ],
  };
}

/**
 * Options: `sandbox`, the filled diagram under its grade; `sized`, sized bins (stages from SIZED_STAGES);
 * `alone`, the sized diagram on its own with every bin kept, for the Understanding page, laid out by `layout`.
 */
function build(stage, { name, example: ex, cats, groups, grade, sizedCats, kind, final, complete }, { sandbox = false, sized = false, alone = false, layout = TALL } = {}) {
  const bins = (at, area, opts) => sizedBins(sizedCats, final, at, area, complete, { ...opts, kind });
  if (sandbox) {
    const frame = merge(title(name), gradeHeader(final, complete), sized ? bins("fill", SANDBOX_SIZED, { keepEmpty: true, gradeLine: true }) : grade("fill", SANDBOX));
    // Every square or section can be clicked to remove its score (copies remove the whole score).
    frame.targets.push(...frame.tokens.map((t) => {
      const w = t.w ?? t.size;
      const h = Math.max(t.h ?? t.size, 10); // a sized 0 has no height, but can still be clicked
      return { kind: "score", id: t.copyOf ?? t.key, score: t.score, x: t.x - w / 2, y: t.y - h / 2, w, h };
    }));
    return { ...frame, ...SANDBOX_TIMING };
  }
  if (sized && alone) return { ...merge(title(name, layout.view), bins(stage, layout.alone, { keepEmpty: true, labels: false })), ...SIZED_TIMING[stage] };
  if (sized) return sizedDemo(stage, name, ex, bins, sizedCats, final);
  const L = stageIndex(stage);
  let body;
  if (L <= stageIndex("replicate")) body = ex(L === stageIndex("replicate"));
  else if (L === stageIndex("sort")) body = sortedFromTimeline(ex(true), categories(cats, null, BOXES_BELOW_TIMELINE));
  else if (L <= stageIndex("subdivide")) body = merge(categories(cats, groups), grade(stage, SMALL));
  else body = grade(stage, BIG);
  return { ...merge(title(name), body), ...TIMING[stage] };
}

/** One stage of the Assessment Type Model; see `build` for the options. */
export function assessmentTypeFrame(course, stage, options = {}) {
  const result = assessmentTypeModel(course);
  const complete = isComplete(course);
  return build(stage, {
    name: "Assessment Type Model",
    // Scores are never copied in this model, so the "replicate" stage looks like the example.
    example: (_, axisY) => example(course, result.scores, false, axisY),
    cats: result.types.map((t) => ({ id: t.id, name: t.shortName, scores: t.scores })),
    groups: result.groups.map((g) => ({ id: g.id, name: g.name, members: g.types.map((t) => t.id) })),
    grade: (at, area) => atGrade(result, at, area, complete),
    sizedCats: result.types.map((t) => ({ id: t.id, name: t.shortName, weight: t.weight, average: t.average, entries: t.scores })),
    kind: "type",
    final: result.final,
    complete,
  }, options);
}

/** One stage of the CO Model; see `build` for the options, and coGrade for `{ fixedBins: true }`. */
export function coFrame(course, stage, options = {}) {
  const result = coModel(course);
  const complete = isComplete(course);
  const ordered = (scores) => [...scores].sort((a, b) => a.order - b.order || a.copy - b.copy);
  return build(stage, {
    name: "CO Model",
    example: (multiplied, axisY) => example(course, result.expanded, multiplied, axisY),
    cats: result.outcomes.flatMap((co) => co.los.map((lo) => ({ id: lo.id, name: lo.name, scores: ordered(lo.scores) }))),
    groups: result.outcomes.map((co) => ({ id: co.id, name: co.name, members: co.los.map((lo) => lo.id) })),
    grade: (at, area) => coGrade(result, at, area, course.loShort, complete, options.fixedBins),
    // An LO without scores keeps one empty slot, so it can still be named and dropped into.
    sizedCats: result.outcomes.map((co) => ({
      id: co.id, name: co.name, weight: co.weight, average: co.average,
      entries: co.los.flatMap((lo) => (lo.scores.length ? lo.scores : [null])),
      spans: co.los.map((lo) => ({ id: lo.id, name: course.loShort[lo.id] ?? lo.name, count: Math.max(1, lo.scores.length) })),
    })),
    kind: "lo",
    final: result.final,
    complete,
  }, options);
}

/**
 * A model's scores as one silhouette in a single box, for the Understanding page: the box is the diagram's whole area
 * (every score a 5), and each score a slice as wide as its share of the grade and as tall as its score, with no gaps
 * between bins, so the area the shape covers is the grade. `cats` are the bins ({ weight, scores }), in order; slices
 * keep their scores' keys, so the diagram's bars close up into the shape. `melted` levels every slice at the shape's
 * mean height: a rectangle with the same area.
 */
function silhouette(cats, { melted = false, layout = TALL } = {}) {
  const { alone } = layout;
  const { base, unit } = binSpace(alone, UNLABELLED_FLOOR);
  const box = { x: alone.x, w: alone.w, top: base - SCORE_MAX * unit };
  const scored = cats.filter((c) => c.scores.length);
  const total = sum(scored.map((c) => c.weight)) || 1;
  const slices = scored.flatMap((c) => c.scores.map((s) => ({ s, w: (box.w * c.weight) / total / c.scores.length })));
  // Melted, every slice levels out at the shape's mean height, so together they make one rectangle of the same area.
  const level = sum(slices.map(({ s, w }) => s.score * w)) / box.w;
  const f = blank();
  let x = box.x;
  slices.forEach(({ s, w }) => {
    const h = (melted ? level : s.score) * unit;
    // A hair wider than its slice, so neighbours overlap and no seam shows between them.
    f.tokens.push(token(s, x + w / 2, base - h / 2, w, { w: w + 0.6, h, round: false, rx: 0, text: "", cls: "token--silhouette" }));
    x += w;
  });
  f.paths.push({ key: "silhouette-box", cls: "bin", d: `M${box.x},${box.top}H${box.x + box.w}V${base}H${box.x}Z` });
  return { ...f, ease: "smooth", duration: melted ? 1200 : 500, stagger: 0 };
}

/** The Assessment Type Model's silhouette: a bin for each assessment type. */
export const assessmentTypeSilhouette = (course, options) => silhouette(assessmentTypeModel(course).types, options);

/** The CO Model's silhouette: a bin for each CO, its (multiplied) scores in LO order, as in its diagram. */
export const coSilhouette = (course, options) => silhouette(coModel(course).outcomes.map((co) => ({ weight: co.weight, scores: co.los.flatMap((lo) => lo.scores) })), options);

/**
 * The Assessment Type Model's trajectory: a staircase in timeline order, rising from bottom left to top right.
 * Each score is a block as tall as its share of the grade so far (its type's weight, shared equally among that type's
 * scores), so blocks within a type are all one height and the staircase reaches 100%; colour shows the score.
 * Each class steps one column to the right; an assignment's scores stack directly on top of one another in a single
 * column. On the right, lines mark each type's share: the assignments' on one line, and beside it the in-class
 * scores' broken line, whose pieces add up to their share.
 * Blocks rise into place in timeline order, rather than growing out of whatever was shown before.
 */
export function assessmentTypeTrajectory(course, { stairs, view } = TALL) {
  const result = assessmentTypeModel(course);
  const f = blank();
  const scored = result.types.filter((t) => t.scores.length);
  const total = sum(scored.map((t) => t.weight)) || 1;
  const share = new Map(scored.map((t) => [t.id, t.weight / total / t.scores.length]));
  const typeName = new Map(result.types.map((t) => [t.id, t.name]));
  const inClass = new Set(course.groups.find((g) => g.id === "in-class")?.types ?? []);
  const sessions = course.sessions.filter((session) => result.scores.some((s) => s.session === session.id));
  const { x: x0, base } = stairs;
  const full = base - stairs.top; // the height of the whole grade so far
  const width = stairs.w - 130; // leaves room on the right for the shares
  const col = width / Math.max(1, sessions.length);

  let y = base;
  const spans = []; // each session's stretch of the grade: { type, top, bottom, order }
  sessions.forEach((session, i) => {
    const x = x0 + i * col;
    const own = result.scores.filter((s) => s.session === session.id);
    const bottom = y;
    own.forEach((s) => {
      const h = share.get(s.source) * full;
      y -= h;
      f.rects.push({ key: `stair-${s.key}`, cls: `stair pastel--${s.score}`, x, y, w: col, h, order: s.order, start: { x, y: y + 260, w: col, h } });
    });
    const type = own[0].source;
    spans.push({ type, top: y, bottom, order: own[0].order });
    // Name each assignment just to the left of where it steps up, and the in-class scores just above the first.
    if (i === 0) {
      f.texts.push({ key: `stair-lbl-${session.id}`, x, y: y - 14, text: "In-class scores", size: 11, anchor: "start", cls: "label label--small", order: own[0].order });
    } else if (!inClass.has(type)) {
      f.texts.push({ key: `stair-lbl-${session.id}`, x: x - 6, y: (y + bottom) / 2, text: typeName.get(type), size: 11, anchor: "end", cls: "label label--small", order: own[0].order });
    }
  });
  f.lines.push({ key: "stair-floor", cls: "axis", x1: x0, y1: base, x2: x0 + width, y2: base });
  f.texts.push({ key: "stair-time", x: x0 + width / 2, y: base + 28, text: "Time →", size: 14, anchor: "middle", cls: "label label--strong" });

  // The shares, on the right: one line for the assignments, and a broken line for the in-class scores beside it.
  const assignmentLine = x0 + width + 22;
  const classLine = assignmentLine + 18;
  const labelX = classLine + 12;
  spans.forEach((span, i) => {
    const isClass = inClass.has(span.type);
    const x = isClass ? classLine : assignmentLine;
    f.lines.push({ key: `share-${i}`, cls: `share-line${isClass ? " share-line--class" : ""}`, x1: x, y1: span.bottom - 1.5, x2: x, y2: span.top + 1.5, order: span.order });
    if (!isClass) {
      const t = scored.find((type) => type.id === span.type);
      f.texts.push({ key: `share-lbl-${i}`, x: labelX, y: (span.top + span.bottom) / 2, text: percent(t.weight / total), size: 12, anchor: "start", cls: "label label--strong", order: span.order });
    }
  });
  const classShare = sum(scored.filter((t) => inClass.has(t.id)).map((t) => t.weight)) / total;
  const firstClass = spans.find((span) => inClass.has(span.type));
  if (firstClass) {
    f.texts.push({ key: "share-lbl-class", x: labelX, y: (firstClass.top + firstClass.bottom) / 2, text: `${percent(classShare)} in class`, size: 12, anchor: "start", cls: "label label--small", order: firstClass.order });
  }
  return { ...merge(title("Assessment Type Model", view), f), ease: "smooth", duration: 900, stagger: 50 };
}
