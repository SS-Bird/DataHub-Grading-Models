// Entry point for the Understanding Grading Models page: three scrolling stories, each a sticky figure
// whose scene follows the step being read. A scene names what the figure shows besides the chart
// (`show`: photo, bar, grade, placeholder, or pair to show `pair`'s frame in a second panel beside the chart),
// whether its scores float, and the chart frame(s) to draw.
// Several frames play one after another, each held for its `hold`; scrolling back up plays them in reverse.
// `reset` puts the example back to its default weights first; `grade` gives the course grade to show beside the diagram.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VIEW, DIAGRAM_SPAN, assessmentTypeFrame, coFrame, assessmentTypeTrajectory } from "./scenes.js";
import { scatterFrame, groupFrame, rowFrame } from "./pool.js";
import { assessmentTypeModel, coModel, format, percent } from "./grading.js";
import { pastelFill } from "./palette.js";
import { explainerPresets, earlySemester, sparseOutcome } from "./data.js";

const POOL_VIEW = { w: 640, h: 600 }; // narrow, leaving the text beside it room
// The sized-scores page draws both models as bins of bars sized by score.
const sized = document.body.dataset.variant === "sized";
const PAUSE = 1600; // between frames of a sequence, unless a frame sets its own `hold`
const NOTHING = { rects: [], paths: [], lines: [], tokens: [], texts: [] };

/** The diagram's own timing bounces scores into place; here they glide. */
const calm = (frame) => ({ ...frame, ease: "smooth", duration: 1200, stagger: 10 });

/** How high the diagram's categories sit, on average, so the row of circles can wait at that height. */
function categoryHeight(frame) {
  const cats = frame.rects.filter((r) => /^(?:bin|t)-/.test(r.key) && r.w > 0);
  return cats.reduce((a, r) => a + r.y + r.h / 2, 0) / Math.max(1, cats.length);
}

/** The circles in a row, in the order the bins (or cells) will be, at the height the diagram's categories sit. */
const inRow = (groups, diagram) => rowFrame(groups, VIEW, { span: DIAGRAM_SPAN, y: categoryHeight(diagram) }, { labels: true });

/**
 * Ease the row of circles into the diagram: its bins appear behind the circles,
 * then the scores move out of the circles into their bins (with any sections they fill).
 */
function intoBins(row, full) {
  return [
    {
      ...full, rects: [...full.rects.filter((r) => !r.key.startsWith("sec-")), ...row.rects], tokens: row.tokens,
      texts: [...full.texts, ...row.texts], outlines: [], ease: "smooth", duration: 700, stagger: 0, hold: 900,
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

const coDiagram = (c) => coFrame(c, "fill", { fixedBins: true, sized, alone: true });
const atDiagram = (c) => assessmentTypeFrame(c, "fill", { sized, alone: true });

const early = (course) => ({ ...course, scores: earlySemester });

/** Assessment types with no scores yet. */
function unfinished(course) {
  const typeOf = new Map(course.sessions.map((s) => [s.id, s.type]));
  return course.assessmentTypes.filter((t) => !course.scores.some((s) => typeOf.get(s.session) === t.id));
}

/** The course without the assessment types still to come; the others share the diagram (the grade is unchanged). */
function scoredOnly(course) {
  const gone = new Set(unfinished(course).map((t) => t.id));
  return {
    ...course,
    assessmentTypes: course.assessmentTypes.filter((t) => !gone.has(t.id)),
    groups: course.groups.map((g) => ({ ...g, types: g.types.filter((id) => !gone.has(id)) })),
  };
}

/** A frame without its title, for a second panel beside one that already has it. */
const untitled = (frame) => ({ ...frame, texts: frame.texts.filter((t) => t.key !== "title") });

/** Name the assessments still to come, and their shares, above a diagram that leaves them out. */
function withStillToCome(course, frame) {
  const names = unfinished(course).map((t) => `${t.name} (${percent(t.weight)})`);
  if (!names.length) return frame;
  return { ...frame, texts: [...frame.texts, { key: "still-to-come", x: VIEW.w / 2, y: 64, text: `Still to come: ${names.join(", ")}`, size: 13, anchor: "middle", cls: "label label--small" }] };
}
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
      fixed: { float: true, frames: (c) => inRow(byMedium(c), atDiagram(c)) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byMedium(c), atDiagram(c)), atDiagram(c)),
      },
      // From here on the example is back at its default weights and can't be edited.
      default: { reset: true, frames: (c) => calm(atDiagram(c)) },
      staircase: { frames: (c) => assessmentTypeTrajectory(c) },
      // Early in the semester: the assignments still to come are left out, so what there is has room;
      // beside the diagram, the same scores stacked, where the few in-class scores stand tall.
      early: {
        show: "grade pair",
        frames: (c) => withStillToCome(early(c), calm(atDiagram(scoredOnly(early(c))))),
        pair: (c) => untitled(assessmentTypeTrajectory(early(c))),
        grade: (c) => assessmentTypeModel(early(c)).final,
      },
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
      fixed: { float: true, frames: (c) => inRow(byPurpose(c), coDiagram(c)) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byPurpose(c), coDiagram(c)), coDiagram(c)),
      },
      multiplied: { show: "bar", frames: (c) => ({ ...withMultipliers(c, multipliedOnly(c, coDiagram(c))), duration: 600, stagger: 0 }) },
      sparse: {
        show: "grade", reset: true,
        frames: (c) => calm(coDiagram(sparse(c))),
        grade: (c) => coModel(sparse(c)).final,
      },
      visualise: { show: "placeholder", reset: true, frames: () => NOTHING },
    },
  },
};

function createStory(section, { view, scenes }) {
  const figure = section.querySelector(".story__figure");
  const chart = createChart(figure.querySelector(".panel svg"), view);
  const pairSvg = figure.querySelector(".story__pair svg");
  const pair = pairSvg && createChart(pairSvg, view);
  const store = createStore(explainerPresets);
  const bars = [...figure.querySelectorAll(".weights__bar")].map((el) => createWeightBar(el, store, el.dataset.list));
  const grade = figure.querySelector(".story__grade-value");
  let scene = null;
  let leaving = null; // the scene just scrolled back up out of, if any
  let timer = null;

  /** Draw the scene; after an edit, jump straight to the end of its sequence. */
  function draw({ replay = true } = {}) {
    clearTimeout(timer);
    const course = store.get();
    let frames = [].concat(scenes[scene].frames(course));
    // Scrolling back up undoes the scene being left, frame by frame, then settles on this scene's last frame.
    if (leaving) frames = [...[].concat(scenes[leaving].frames(course)).slice(0, -1).reverse(), frames.at(-1)];
    const play = (i) => {
      chart.render(frames[i]);
      if (i + 1 < frames.length) timer = setTimeout(() => play(i + 1), frames[i].hold ?? PAUSE);
    };
    pair?.render(scenes[scene].pair?.(course) ?? NOTHING);
    const value = scenes[scene].grade?.(store.get()) ?? null;
    if (grade && value !== null) {
      grade.textContent = format(value);
      grade.style.background = pastelFill(value);
    }
    play(replay ? 0 : frames.length - 1);
  }

  function enter(name) {
    if (name === scene) return;
    leaving = scene && order.indexOf(name) < order.indexOf(scene) ? scene : null;
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
  const order = steps.map((s) => s.dataset.scene);
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
