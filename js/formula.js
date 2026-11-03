// The calculation written out under each diagram on the Calculations pages, filled in stage by stage:
// each category's weight with empty brackets, then the scores in each bracket (as their simple average),
// then those averages, and at the end the grade. Once categories without scores are cut away, the rest are
// divided by their total weight, written beneath them as a fraction.

import { assessmentTypeModel, coModel, format } from "./grading.js";

const MAX_TERMS = 10; // scores written out in a bracket before the rest are left as "…"

// At each stage: which categories are written ("all", or only those with scores), what goes in their brackets,
// and whether the grade is written after the "=".
const ORIGINAL = {
  frame: ["all", "empty"], subdivide: ["all", "empty"], fill: ["all", "scores"],
  melt1: ["all", "averages"], melt2: ["kept", "averages"], final: ["kept", "averages", true],
};
const SIZED = {
  frame: ["all", "empty"], cut: ["kept", "empty"], fill: ["kept", "scores"],
  melt: ["kept", "averages"], final: ["kept", "averages", true],
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const decimal = (w) => String(Number(w.toFixed(2)));
const EMPTY = '<span class="calc__in calc__in--empty"></span>';

function bracket(cat, show) {
  if (show === "empty" || !cat.scores.length) return EMPTY;
  if (show === "averages") return `<span class="calc__in">${format(cat.average)}</span>`;
  const values = cat.scores.map((s) => s.score);
  const written = values.length > MAX_TERMS ? [...values.slice(0, MAX_TERMS - 1), "…"] : values;
  return `<span class="calc__in calc__frac"><span>${written.join("+")}</span><span>${values.length}</span></span>`;
}

/** The calculation as HTML for one model ("at" or "co") at one stage; empty before the bins appear. */
export function calculation(course, model, stage, sized) {
  const step = (sized ? SIZED : ORIGINAL)[stage];
  if (!step) return "";
  const [which, show, done] = step;
  const result = model === "at" ? assessmentTypeModel(course) : coModel(course);
  const all = model === "at" ? result.types : result.outcomes;
  const cats = which === "kept" ? all.filter((c) => c.scores.length) : all;
  if (!cats.length) return "";

  const terms = cats.map((c) => `<span class="calc__term">${decimal(c.weight)}(${bracket(c, show)})</span>`)
    .join('<span class="calc__op">+</span>');
  // Weights that no longer add up to 1 are divided out, so the grade stays on the 0–5 scale.
  const total = sum(cats.map((c) => c.weight));
  const sumOf = Math.abs(total - 1) > 0.005
    ? `<span class="calc__frac calc__frac--whole"><span>${terms}</span><span>${decimal(total)}</span></span>`
    : terms;
  const grade = done && result.final !== null ? `<span class="calc__in calc__result">${format(result.final)}</span>` : EMPTY;
  return `${sumOf}<span class="calc__op">=</span>${grade}`;
}
