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
  const size = Math.min(cw, ch) * 0.45;
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
