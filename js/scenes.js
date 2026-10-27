// Scene layouts: one frame per scroll stage for each model, in the panel's viewBox.
// Frames are plain data ({ rects, paths, lines, links, tokens, outlines, texts }); chart.js animates between them.
// Frames also list drop `targets` (the categories a score can be dragged into), which chart.js ignores.
//
// Top of the panel: the example and the categories scores are sorted into.
// Bottom of the panel: the grade drawn as areas (AT: a closed rectangle; CO: open bins that grow).

import { assessmentTypeModel, coModel, format, percent } from "./grading.js";
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
const AXIS_Y = 150;
const TOKEN = 26;
const BOXES = { y: 112, h: 210 };
const BOXES_BELOW_TIMELINE = { y: 380, h: 200 };
const SMALL = { top: 392, bottom: 744 };
const BIG = { top: 84, bottom: 744 };
const SANDBOX = { top: 170, bottom: 744 };
const BIN_HEIGHT = 0.85; // an empty bin's height, as a share of the room it can grow into
const CUBE_GAP = 0.11; // share of a cell left empty on each free side of a cube

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

const title = (text) => ({ texts: [{ key: "title", x: VIEW.w / 2, y: 36, text, size: 22, anchor: "middle", cls: "title" }] });

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
function example(course, scores, multiplied) {
  const f = blank();
  const shown = multiplied ? scores : scores.filter((s) => !s.copyOf);
  const sessions = course.sessions.filter((session) => shown.some((s) => s.session === session.id));
  const spacing = W / Math.max(1, sessions.length);

  f.lines.push({ key: "axis", cls: "axis", x1: X0, y1: AXIS_Y, x2: X0 + W, y2: AXIS_Y });
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

    f.lines.push({ key: `stem-${session.id}`, cls: "stem", x1: x, y1: AXIS_Y, x2: x, y2: isClass ? AXIS_Y - 56 : AXIS_Y + 30 });
    // Each score sits on its own row, its copies joined beside it.
    originals.forEach((o, r) => {
      const y = isClass ? AXIS_Y - 56 - size / 2 : AXIS_Y + 34 + size / 2 + r * (size + 6);
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

/* ---------- Bottom: CO Model as open bins (one per CO) holding smaller LO bins of cubes ---------- */

/** Largest cube size that keeps every LO bin's stack within the available height. */
function cubeSize(subs, maxH) {
  for (let size = 72; size > 8; size -= 1) {
    const fits = subs.every((sub) => {
      const cols = Math.floor((sub.w - 4) / size);
      return cols >= 1 && Math.ceil(sub.lo.scores.length / cols) * size <= maxH;
    });
    if (fits) return size;
  }
  return 8;
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
  const pad = 8;
  const subGap = 6;
  const headroom = 44; // space above the tallest LO bin for its label
  let x = X0;
  const bins = result.outcomes.map((co) => {
    const w = (W * co.weight) / total;
    const bin = { co, x: x + gap / 2, w: w - gap };
    x += w;
    return bin;
  }).filter((b) => b.w > 0);
  if (!bins.length) return f;

  // Each CO bin is shared equally by its LOs, each with its own smaller bin.
  bins.forEach((b) => {
    const n = b.co.los.length;
    const sw = (b.w - 2 * pad - subGap * (n - 1)) / n;
    b.subs = b.co.los.map((lo, k) => ({ lo, x: b.x + pad + k * (sw + subGap), w: sw }));
  });

  // Cubes stack from the bottom of their LO bin, snaking left-right then right-left so copies stay side by side.
  // Bins start tall and only grow taller once their cubes need the room; all bins stay the same height.
  const size = cubeSize(bins.flatMap((b) => b.subs), (fixedBins ? maxH * BIN_HEIGHT : maxH) - headroom);
  bins.forEach((b) => {
    b.subs.forEach((sub) => {
      sub.cols = Math.max(1, Math.floor((sub.w - 4) / size));
      const left = sub.x + (sub.w - sub.cols * size) / 2;
      sub.cells = sub.lo.scores.map((s, i) => {
        const row = Math.floor(i / sub.cols);
        const col = row % 2 ? sub.cols - 1 - (i % sub.cols) : i % sub.cols;
        return { s, col, row, x: left + col * size, y: base - 3 - (row + 1) * size };
      });
    });
    b.cells = b.subs.flatMap((sub) => sub.cells);
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
    f.texts.push({ key: `bin-lbl-${b.co.id}`, x: b.x + b.w / 2, y: base + 20, text: `${b.co.name} · ${percent(b.co.weight)}`, size: 13, anchor: "middle", cls: "label label--strong" });

    if (L >= stageIndex("subdivide") && L <= stageIndex("fill")) {
      b.subs.forEach((sub) => {
        const { lo } = sub;
        const subTop = base - b.wall;
        f.rects.push({ key: `sub-${lo.id}`, cls: "sub-bin", x: sub.x, y: subTop, w: sub.w, h: b.wall, hatch: !lo.scores.length });
        f.paths.push({ key: `subline-${lo.id}`, cls: "bin bin--lo", d: binPath(sub.x, subTop, sub.w, base) });
        f.texts.push({ key: `lo-lbl-${lo.id}`, x: sub.x + sub.w / 2, y: subTop - 12, text: loShort[lo.id] ?? lo.name, size: clamp(sub.w / 6, 9, 14), anchor: "middle", cls: `label label--strong ${onTone}` });
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

    // The cubes melt straight into the CO's simple average, keeping the exact shape they filled.
    // Next, each CO's shape settles into a rectangle as wide as its bin; every CO's rectangle is the same height,
    // so its area is its weight. Each cube's cell becomes one vertical strip of that rectangle.
    if ((L === stageIndex("melt1") || L === stageIndex("melt2")) && b.co.average !== null) {
      const settled = L === stageIndex("melt2");
      const rect = { x: b.x + 4, y: top + 4, w: b.w - 8, h: h - 7 };
      const strip = rect.w / b.cells.length;
      b.cells.forEach((c, k) => {
        // Pieces overlap by a pixel so neighbouring cells and strips read as one block.
        const shape = settled
          ? { x: rect.x + k * strip, y: rect.y, w: Math.min(strip + 1, rect.x + rect.w - (rect.x + k * strip)), h: rect.h }
          : { x: c.x, y: c.y, w: size + 1, h: size + 1 };
        f.rects.push({ key: `melt-${c.s.key}`, cls: "cell melt", ...shape, ...averaged(b.co.average) });
      });
      const xs = b.cells.map((c) => c.x);
      const ys = b.cells.map((c) => c.y);
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

function build(stage, { name, example: ex, cats, groups, grade, final, complete }, { sandbox = false } = {}) {
  if (sandbox) {
    const frame = merge(title(name), gradeHeader(final, complete), grade("fill", SANDBOX));
    // Every square or section can be clicked to remove its score (copies remove the whole score).
    frame.targets.push(...frame.tokens.map((t) => {
      const w = t.w ?? t.size;
      const h = t.h ?? t.size;
      return { kind: "score", id: t.copyOf ?? t.key, score: t.score, x: t.x - w / 2, y: t.y - h / 2, w, h };
    }));
    return { ...frame, ...SANDBOX_TIMING };
  }
  const L = stageIndex(stage);
  let body;
  if (L <= stageIndex("replicate")) body = ex(L === stageIndex("replicate"));
  else if (L === stageIndex("sort")) body = sortedFromTimeline(ex(true), categories(cats, null, BOXES_BELOW_TIMELINE));
  else if (L <= stageIndex("subdivide")) body = merge(categories(cats, groups), grade(stage, SMALL));
  else body = grade(stage, BIG);
  return { ...merge(title(name), body), ...TIMING[stage] };
}

/** One stage of the Assessment Type Model; with `{ sandbox: true }`, the filled diagram under its grade. */
export function assessmentTypeFrame(course, stage, options) {
  const result = assessmentTypeModel(course);
  const complete = isComplete(course);
  return build(stage, {
    name: "Assessment Type Model",
    // Scores are never copied in this model, so the "replicate" stage looks like the example.
    example: () => example(course, result.scores, false),
    cats: result.types.map((t) => ({ id: t.id, name: t.shortName, scores: t.scores })),
    groups: result.groups.map((g) => ({ id: g.id, name: g.name, members: g.types.map((t) => t.id) })),
    grade: (at, area) => atGrade(result, at, area, complete),
    final: result.final,
    complete,
  }, options);
}

/** One stage of the CO Model; with `{ sandbox: true }`, the filled diagram under its grade; `{ fixedBins: true }`, see coGrade. */
export function coFrame(course, stage, options = {}) {
  const result = coModel(course);
  const complete = isComplete(course);
  const ordered = (scores) => [...scores].sort((a, b) => a.order - b.order || a.copy - b.copy);
  return build(stage, {
    name: "CO Model",
    example: (multiplied) => example(course, result.expanded, multiplied),
    cats: result.outcomes.flatMap((co) => co.los.map((lo) => ({ id: lo.id, name: lo.name, scores: ordered(lo.scores) }))),
    groups: result.outcomes.map((co) => ({ id: co.id, name: co.name, members: co.los.map((lo) => lo.id) })),
    grade: (at, area) => coGrade(result, at, area, course.loShort, complete, options.fixedBins),
    final: result.final,
    complete,
  }, options);
}

/**
 * The Assessment Type Model taken apart, drawn like the diagram: the in-class categories lie across the whole
 * bottom, one on top of the other, and the assignments stand on them in order, earliest on the left.
 * Every cell keeps its area, so its area is still its weight. Names and shares are left off: only the shape matters here.
 */
export function assessmentTypeStaircase(course) {
  const result = assessmentTypeModel(course);
  const f = blank();
  const total = sum(result.types.map((t) => t.weight)) || 1;
  const area = W * 410; // all the cells together, in square viewBox units
  const base = 730;
  const gap = 4;
  const pad = { side: 6, top: 12, bottom: 6 }; // a group's frame around its cells, as in the diagram (no label row)
  const heightOf = (t, w) => (area * t.weight) / total / w;

  const cell = (t, tr) => {
    f.rects.push({ key: `t-${t.id}`, cls: "cell", rx: 4, ...tr, hatch: !t.scores.length });
    scoreSections(f, t, tr);
  };
  const groupFrame = (key, gi, box) => f.rects.push({ key, cls: `area--${gi % 2}`, ...box });

  // In-class: full width along the bottom, the first category lowest.
  const [floor, ...standing] = result.groups;
  const inner = W - 2 * pad.side;
  const heights = floor.types.map((t) => heightOf(t, inner));
  const floorH = pad.top + sum(heights) + gap * (heights.length - 1) + pad.bottom;
  groupFrame(`g-${floor.id}`, 0, { x: X0, y: base - floorH, w: W, h: floorH });
  let y = base - pad.bottom;
  floor.types.forEach((t, i) => {
    y -= heights[i];
    cell(t, { x: X0 + pad.side, y, w: inner, h: heights[i] });
    y -= gap;
  });

  // Assignments: one column each, standing on the in-class floor.
  const columns = standing.flatMap((g, k) => g.types.map((t, j) => ({ g, gi: k + 1, t, first: j === 0 })));
  const colW = W / Math.max(1, columns.length);
  columns.forEach(({ g, gi, t, first }, i) => {
    const box = { x: X0 + i * colW + (i ? gap / 2 : 0), w: colW - (i ? gap / 2 : 0) - (i < columns.length - 1 ? gap / 2 : 0) };
    const h = heightOf(t, box.w - 2 * pad.side);
    const frameH = pad.top + h + pad.bottom;
    const top = base - floorH - gap - frameH;
    groupFrame(first ? `g-${g.id}` : `gs-${t.id}`, gi, { ...box, y: top, h: frameH });
    cell(t, { x: box.x + pad.side, y: top + pad.top, w: box.w - 2 * pad.side, h });
  });

  return { ...merge(title("Assessment Type Model"), f), ease: "smooth", duration: 1800, stagger: 0 };
}
