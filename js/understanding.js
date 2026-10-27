// Entry point for the Understanding Grading Models page: three scrolling stories, each a sticky figure
// whose scene follows the step being read. A scene names what the figure shows besides the chart
// (`show`: photo, bar or placeholder), whether its scores float, and the chart frame(s) to draw.
// Several frames play one after another, each held for its `hold`; `reset` puts the example back to its default
// weights first; `grade` gives the course grade to show beside the diagram.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VIEW, assessmentTypeFrame, coFrame, assessmentTypeStaircase } from "./scenes.js";
import { scatterFrame, groupFrame } from "./pool.js";
import { assessmentTypeModel, coModel, format } from "./grading.js";
import { pastelFill } from "./palette.js";
import { explainerPresets, earlySemester, sparseOutcome } from "./data.js";

const POOL_VIEW = { w: 1000, h: 460 };
const PAUSE = 1600; // between frames of a sequence, unless a frame sets its own `hold`
const NOTHING = { rects: [], paths: [], lines: [], tokens: [], texts: [] };

/** The diagram's own timing bounces scores into place; here they glide. */
const calm = (frame) => ({ ...frame, ease: "smooth", duration: 1200, stagger: 10 });

/**
 * Ease a pool into a diagram: the pool shrinks into the top-left corner to make room, the diagram appears,
 * then the scores drop into it (with any sections they fill).
 */
// `k` scales the pool and (`x`, `y`) places it; the AT diagram starts higher, so its pool tucks into the title row.
function intoDiagram(pool, full, { k = 0.22, x = 8, y = 8 } = {}) {
  const corner = {
    ...NOTHING,
    rects: pool.rects.map((r) => ({ ...r, x: x + r.x * k, y: y + r.y * k, w: r.w * k, h: r.h * k, rx: r.rx * k })),
    tokens: pool.tokens.map((t) => ({ ...t, x: x + t.x * k, y: y + t.y * k, size: t.size * k })),
  };
  return [
    { ...corner, ease: "smooth", duration: 700, stagger: 0, hold: 800 },
    {
      ...full, rects: [...corner.rects, ...full.rects.filter((r) => !r.key.startsWith("sec-"))], tokens: corner.tokens,
      ease: "smooth", duration: 700, stagger: 0, hold: 800,
    },
    { ...full, ease: "smooth", duration: 1200, stagger: 12 },
  ];
}

/** Where a token's score came from: its assessment type, and how many times it is counted. */
function sourceOf(course, token) {
  const id = token.copyOf ?? token.key;
  const session = course.sessions.find((s) => s.id === course.scores.find((x) => x.id === id)?.session);
  return course.assessmentTypes.find((t) => t.id === session?.type);
}

/** Fade the scores counted only once, leaving the multiplied scores to stand out. */
function multipliedOnly(course, frame) {
  return { ...frame, tokens: frame.tokens.map((t) => (sourceOf(course, t)?.multiplier === 1 ? { ...t, opacity: 0.2 } : t)) };
}

/** Label each multiplied score with how many times it is added to its bin ("2×"). */
function withMultipliers(course, frame) {
  const badges = frame.tokens.filter((t) => !t.copyOf && sourceOf(course, t)?.multiplier > 1).map((t) => ({
    key: `mult-${t.key}`, x: t.x - (t.w ?? t.size) / 2 + 2, y: t.y - (t.h ?? t.size) / 2 - 7,
    text: `${sourceOf(course, t).multiplier}×`, size: 11, cls: "multiplier-badge",
  }));
  return { ...frame, texts: [...frame.texts, ...badges] };
}

const coDiagram = (c) => coFrame(c, "fill", { fixedBins: true });

const early = (course) => ({ ...course, scores: earlySemester });
const sparse = (course) => ({ ...course, scores: sparseOutcome });

/** The course's scores grouped by assessment type (medium) or by course outcome (purpose). */
function byMedium(course) {
  const typeOf = new Map(course.sessions.map((s) => [s.id, s.type]));
  return course.assessmentTypes.map((t) => ({ ...t, scores: course.scores.filter((s) => typeOf.get(s.session) === t.id) }));
}

const byPurpose = (course) => course.outcomes.map((o) => ({ ...o, scores: course.scores.filter((s) => o.los.includes(s.lo)) }));

const STORIES = {
  intro: {
    view: POOL_VIEW,
    scenes: {
      scatter: { float: true, frames: (c) => scatterFrame(c.scores, POOL_VIEW) },
      grouped: { float: true, frames: (c) => groupFrame(byMedium(c), POOL_VIEW) },
    },
  },
  at: {
    view: VIEW,
    scenes: {
      photos: { show: "photo photo-right", frames: () => NOTHING },
      photo: { show: "photo", frames: () => NOTHING },
      circles: { float: true, frames: (c) => groupFrame(byMedium(c), VIEW, { labels: true }) },
      fixed: { float: true, frames: (c) => groupFrame(byMedium(c), VIEW, { labels: true, weighted: true }) },
      diagram: {
        show: "bar",
        frames: (c) => intoDiagram(groupFrame(byMedium(c), VIEW, { labels: true, weighted: true }), assessmentTypeFrame(c, "fill"), { k: 0.11, x: 36, y: 2 }),
      },
      // From here on the example is back at its default weights and can't be edited.
      early: {
        show: "grade", reset: true,
        frames: (c) => calm(assessmentTypeFrame(early(c), "fill")),
        grade: (c) => assessmentTypeModel(early(c)).final,
      },
      default: { frames: (c) => calm(assessmentTypeFrame(c, "fill")) },
      staircase: { frames: (c) => assessmentTypeStaircase(c) },
    },
  },
  co: {
    view: VIEW,
    scenes: {
      photo: { show: "photo", frames: () => NOTHING },
      circles: {
        float: true,
        frames: (c) => [groupFrame(byMedium(c), VIEW, { labels: true }), groupFrame(byPurpose(c), VIEW, { labels: true })],
      },
      fixed: { float: true, frames: (c) => groupFrame(byPurpose(c), VIEW, { labels: true, weighted: true }) },
      diagram: {
        show: "bar",
        frames: (c) => intoDiagram(groupFrame(byPurpose(c), VIEW, { labels: true, weighted: true }), coDiagram(c)),
      },
      multiplied: { show: "bar", frames: (c) => ({ ...withMultipliers(c, multipliedOnly(c, coDiagram(c))), duration: 600, stagger: 0 }) },
      sparse: {
        show: "grade", reset: true,
        frames: (c) => calm(coFrame(sparse(c), "fill", { fixedBins: true })),
        grade: (c) => coModel(sparse(c)).final,
      },
      visualise: { show: "placeholder", reset: true, frames: () => NOTHING },
    },
  },
};

function createStory(section, { view, scenes }) {
  const figure = section.querySelector(".story__figure");
  const chart = createChart(figure.querySelector("svg"), view);
  const store = createStore(explainerPresets);
  const bars = [...figure.querySelectorAll(".weights__bar")].map((el) => createWeightBar(el, store, el.dataset.list));
  const grade = figure.querySelector(".story__grade-value");
  let scene = null;
  let timer = null;

  /** Draw the scene; after an edit, jump straight to the end of its sequence. */
  function draw({ replay = true } = {}) {
    clearTimeout(timer);
    const frames = [].concat(scenes[scene].frames(store.get()));
    const play = (i) => {
      chart.render(frames[i]);
      if (i + 1 < frames.length) timer = setTimeout(() => play(i + 1), frames[i].hold ?? PAUSE);
    };
    const value = scenes[scene].grade?.(store.get()) ?? null;
    if (grade && value !== null) {
      grade.textContent = format(value);
      grade.style.background = pastelFill(value);
    }
    play(replay ? 0 : frames.length - 1);
  }

  function enter(name) {
    if (name === scene) return;
    scene = name;
    const { show = "", float = false, reset = false } = scenes[name];
    figure.dataset.show = show;
    figure.classList.toggle("is-floating", float);
    if (!reset) return draw();
    entering = true;
    store.load(); // redraws through the subscription below
  }

  let entering = false;
  store.subscribe(() => {
    bars.forEach((b) => b.render());
    if (scene) draw({ replay: entering });
    entering = false;
  });
  bars.forEach((b) => b.render());

  // A step becomes active when it crosses the reading line: the middle of the screen beside the figure,
  // or lower down when the figure sits above the steps.
  const steps = [...section.querySelectorAll(".step")];
  const stacked = section.classList.contains("story--stacked") || window.matchMedia("(max-width: 50rem)").matches;
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      steps.forEach((s) => s.classList.toggle("is-active", s === e.target));
      enter(e.target.dataset.scene);
    }),
    { rootMargin: stacked ? "-75% 0px -24% 0px" : "-50% 0px -49% 0px" },
  );
  steps.forEach((step) => observer.observe(step));
  enter(steps[0].dataset.scene);
}

document.querySelectorAll("[data-story]").forEach((section) => createStory(section, STORIES[section.dataset.story]));
