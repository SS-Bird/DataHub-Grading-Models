// A vertical, draggable weight bar for one model's categories.
// Dragging the edge between two categories moves weight from one to the other.
//   assessmentTypes / outcomes: every category's weight;
//   groups: In-Class against Assignments, scaling the categories inside each;
//   withinGroups: the categories, but only within their group's share (the edges between groups stay put).

import { assessmentTypeModel, coModel, percent } from "./grading.js";
import { MIN_WEIGHT } from "./store.js";

const STEP = 0.01;
const NARROW = 0.12; // below this share, a segment shows only its percentage

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = (w) => Math.round(w / STEP) * STEP;

const groupIndex = (course, typeId) => course.groups.findIndex((g) => g.types.includes(typeId));

const types = {
  title: "Assessment Type Model",
  name: (t) => t.shortName,
  items: (c) => c.assessmentTypes,
  categories: (c) => assessmentTypeModel(c).types,
  set: (store, weights) => store.setWeights("assessmentTypes", weights),
};

const BARS = {
  assessmentTypes: types,
  outcomes: {
    title: "CO Model",
    name: (o) => o.name,
    items: (c) => c.outcomes,
    categories: (c) => coModel(c).outcomes,
    set: (store, weights) => store.setWeights("outcomes", weights),
  },
  groups: {
    title: "In-Class against Assignments",
    name: (g) => g.name,
    items: (c) => assessmentTypeModel(c).groups,
    categories: (c) => assessmentTypeModel(c).groups.map((g) => ({ id: g.id, scores: g.types.flatMap((t) => t.scores) })),
    set: (store, weights) => store.setGroupWeights(weights),
  },
  withinGroups: {
    ...types,
    title: "Within In-Class and Assignments",
    tone: (c, t) => groupIndex(c, t.id) % 2,
    fixed: (c, i) => groupIndex(c, c.assessmentTypes[i].id) !== groupIndex(c, c.assessmentTypes[i + 1].id),
  },
};

export function createWeightBar(track, store, list) {
  const bar = BARS[list];
  const items = () => bar.items(store.get());
  const tone = (item, i) => bar.tone?.(store.get(), item) ?? i % 2;

  const segments = items().map((item, i) => {
    const el = document.createElement("div");
    el.className = `weights__segment weights__segment--${tone(item, i)}`;
    el.innerHTML = `<span class="weights__name">${bar.name(item)}</span><span class="weights__percent"></span>`;
    track.append(el);
    return el;
  });

  /** Move the edge after segment i to `edge` (a share of the whole bar, from the top). */
  function moveEdge(i, edge) {
    const weights = items().map((t) => t.weight);
    const total = sum(weights);
    const before = sum(weights.slice(0, i));
    const pair = weights[i] + weights[i + 1];
    const upper = clamp(snap(edge * total - before), MIN_WEIGHT, pair - MIN_WEIGHT);
    weights[i] = upper;
    weights[i + 1] = snap(pair - upper);
    bar.set(store, weights);
  }

  // Edges that can't move get no handle.
  const handles = items().slice(1).map((_, i) => {
    if (bar.fixed?.(store.get(), i)) return null;
    const handle = document.createElement("div");
    handle.className = "weights__handle";
    handle.tabIndex = 0;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-label", `${bar.title}: edge between ${bar.name(items()[i])} and ${bar.name(items()[i + 1])}`);
    track.append(handle);

    const edgeAt = () => sum(items().slice(0, i + 1).map((t) => t.weight)) / sum(items().map((t) => t.weight));
    handle.addEventListener("pointerdown", (e) => {
      handle.setPointerCapture(e.pointerId);
      track.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const r = track.getBoundingClientRect();
      moveEdge(i, (e.clientY - r.top) / r.height);
    });
    handle.addEventListener("lostpointercapture", () => track.classList.remove("is-dragging"));
    handle.addEventListener("keydown", (e) => {
      const delta = { ArrowUp: -STEP, ArrowLeft: -STEP, ArrowDown: STEP, ArrowRight: STEP }[e.key];
      if (!delta) return;
      e.preventDefault();
      moveEdge(i, edgeAt() + delta);
    });
    return handle;
  });

  function render() {
    const course = store.get();
    const list = items();
    const total = sum(list.map((t) => t.weight)) || 1;
    const scored = new Set(bar.categories(course).filter((c) => c.scores.length).map((c) => c.id));
    let at = 0;
    list.forEach((item, i) => {
      const share = item.weight / total;
      const el = segments[i];
      el.style.top = `${at * 100}%`;
      el.style.height = `${share * 100}%`;
      el.classList.toggle("is-narrow", share < NARROW);
      el.classList.toggle("is-empty", !scored.has(item.id));
      el.querySelector(".weights__percent").textContent = percent(item.weight);
      at += share;
      if (handles[i]) {
        handles[i].style.top = `${at * 100}%`;
        handles[i].setAttribute("aria-valuenow", String(Math.round(at * 100)));
        handles[i].setAttribute("aria-valuetext", `${bar.name(item)} ${percent(item.weight)}, ${bar.name(list[i + 1])} ${percent(list[i + 1].weight)}`);
      }
    });
  }

  return { render };
}
