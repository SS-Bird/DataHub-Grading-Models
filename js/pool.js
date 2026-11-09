// The pool of floating scores on the Understanding Grading Models page, as frames for chart.js.
// Scores keep their ids as keys, so the same scores can drift, gather into circles and then fall into a grade diagram.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const TIMING = { ease: "smooth", duration: 1600, stagger: 25 };

const empty = () => ({ rects: [], paths: [], lines: [], tokens: [], texts: [] });

const token = (s, x, y, size, order) => ({ key: s.id, x, y, size, score: s.score, round: true, order });

/** Scores scattered loosely over the view: one per cell of a grid, nudged off-centre (the same way every time). */
export function scatterFrame(scores, view) {
  const random = d3.randomLcg(7);
  const cols = Math.ceil(Math.sqrt((scores.length * view.w) / view.h));
  const rows = Math.ceil(scores.length / cols);
  const cw = view.w / cols;
  const ch = view.h / rows;
  const size = Math.min(cw, ch) * 0.32;
  const f = empty();
  f.tokens = scores.map((s, i) => {
    const x = (i % cols + 0.5 + (random() - 0.5) * 0.6) * cw;
    const y = (Math.floor(i / cols) + 0.5 + (random() - 0.5) * 0.6) * ch;
    return token(s, x, y, size, i);
  });
  return { ...f, ...TIMING };
}

/**
 * Scores gathered into thin circles, one per group ({ id, name, weight, scores }).
 * `labels` names each circle; `weighted` sizes each circle by its group's weight instead of its number of scores.
 */
export function groupFrame(groups, view, { labels = false, weighted = false } = {}) {
  const top = labels ? 40 : 10;
  const children = groups.filter((g) => g.scores.length).map((g) => ({
    g,
    children: g.scores.map((s) => ({ s, value: weighted ? g.weight / g.scores.length : 1 })),
  }));
  const root = d3.pack()
    .size([view.w - 20, view.h - top - 10])
    .padding((node) => (node.depth === 0 ? (labels ? 44 : 18) : 3))(d3.hierarchy({ children }).sum((d) => d.value ?? 0));

  const f = empty();
  root.children?.forEach((group) => {
    const { g } = group.data;
    const cx = group.x + 10;
    const cy = group.y + top;
    f.rects.push({ key: `ring-${g.id}`, cls: "ring", x: cx - group.r, y: cy - group.r, w: 2 * group.r, h: 2 * group.r, rx: group.r });
    if (labels) {
      f.texts.push({ key: `ring-lbl-${g.id}`, x: cx, y: cy - group.r - 12, text: g.name, size: 14, anchor: "middle", cls: "label label--strong" });
    }
    group.children.forEach((leaf) => {
      f.tokens.push(token(leaf.data.s, leaf.x + 10, leaf.y + top, 2 * leaf.r - 2, f.tokens.length));
    });
  });
  return { ...f, ...TIMING };
}

/**
 * The circles laid in a row, in the order their bins will be: each in a slot across `span` ({ x, w }) as wide as its
 * share of the weight (so over its bin, where bins are laid out that way), centred at height `y`.
 * Circles keep areas in proportion to their weights, as large as the narrowest slot allows. `labels` names each
 * circle, alternately above and below so neighbouring names don't collide.
 * `minShare` (the smallest share a group's weight can be dragged to) fixes the scale instead, as large as a group of
 * that share allows, so changing two groups' weights moves and resizes only their two circles.
 */
export function rowFrame(groups, view, { span, y }, { labels = false, minShare = null } = {}) {
  const total = groups.reduce((a, g) => a + g.weight, 0) || 1;
  let at = span.x;
  const slots = groups.map((g) => {
    const w = (span.w * g.weight) / total;
    const slot = { g, cx: at + w / 2, w };
    at += w;
    return slot;
  }).filter((slot) => slot.g.scores.length);
  const k = minShare
    ? Math.min(view.h * 0.16, (span.w * minShare / 2 - 3) / Math.sqrt(minShare))
    : Math.min(view.h * 0.16, ...slots.map(({ g, w }) => (w / 2 - 3) / Math.sqrt(g.weight / total)));
  const f = empty();
  slots.forEach(({ g, cx }, i) => {
    const r = k * Math.sqrt(g.weight / total);
    f.rects.push({ key: `ring-${g.id}`, cls: "ring", x: cx - r, y: y - r, w: 2 * r, h: 2 * r, rx: r });
    if (labels) {
      const below = i % 2 === 1;
      f.texts.push({ key: `ring-lbl-${g.id}`, x: cx, y: below ? y + r + 14 : y - r - 10, text: g.name, size: 12, anchor: "middle", cls: "label label--strong" });
    }
    const root = d3.pack().size([2 * r, 2 * r]).padding(2)(d3.hierarchy({ children: g.scores.map((s) => ({ s })) }).count());
    root.leaves().forEach((leaf) => {
      f.tokens.push(token(leaf.data.s, cx - r + leaf.x, y - r + leaf.y, 2 * leaf.r - 1.5, f.tokens.length));
    });
  });
  return { ...f, ...TIMING };
}

/**
 * The groups' circles (as groupFrame with weights and labels) drawn as networks: inside each circle, its LOs
 * ({ los: names } on each group) are plain text, each with its scores in a ring around it, joined to it by thin lines.
 */
export function networkFrame(groups, view) {
  const f = groupFrame(groups, view, { labels: true, weighted: true });
  const byId = new Map(groups.map((g) => [g.id, g]));
  f.tokens = [];
  f.lines = [];
  f.rects.filter((r) => r.key.startsWith("ring-")).forEach((ring) => {
    const g = byId.get(ring.key.slice("ring-".length));
    const R = ring.w / 2;
    const cx = ring.x + R;
    const cy = ring.y + R;
    const los = g.los.filter((lo) => g.scores.some((s) => s.lo === lo));
    // Hubs evenly around the circle's centre (just the centre for one LO), each with room for its ring of scores.
    const reach = los.length > 1 ? R * 0.45 : 0;
    const ringR = los.length > 1 ? R * 0.3 : R * 0.5;
    los.forEach((lo, i) => {
      const a = Math.PI + (2 * Math.PI * i) / los.length;
      const hx = cx + reach * Math.cos(a);
      const hy = cy + reach * Math.sin(a);
      f.texts.push({ key: `hub-${lo}`, x: hx, y: hy + 5, text: lo, size: 14, anchor: "middle", cls: "label label--strong" });
      const own = g.scores.filter((s) => s.lo === lo);
      const size = Math.min(26, (2 * Math.PI * ringR) / own.length - 4);
      own.forEach((s, j) => {
        const b = -Math.PI / 2 + (2 * Math.PI * j) / own.length;
        const x = hx + ringR * Math.cos(b);
        const y = hy + ringR * Math.sin(b);
        f.tokens.push(token(s, x, y, size, f.tokens.length));
        // From just outside the LO's name to just outside the score.
        const gap = 18;
        f.lines.push({
          key: `net-${s.id}`, cls: "network-line",
          x1: hx + gap * Math.cos(b), y1: hy + gap * Math.sin(b),
          x2: x - (size / 2) * Math.cos(b), y2: y - (size / 2) * Math.sin(b),
        });
      });
    });
  });
  return f;
}
