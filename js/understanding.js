// Entry point for the Understanding Grading Models page: three scrolling stories, each a sticky figure
// whose scene follows the step being read. A scene names what the figure shows besides the chart
// (`show`: photo, bar, grade, placeholder), whether its scores float, and the chart frame(s) to draw.
// Several frames play one after another, each held for its `hold`; scrolling back up plays them in reverse.
// `reset` puts the example back to its default weights first; `grade` gives the course grade to show beside the diagram.
// The step's buttons play a scene's other sequences: `within` (each category's scores melt into their average),
// `overall` (then the categories close up into one shape, which melts into the overall grade) and `unfold`
// (the semester from its start). A frame may carry the `grade` and `course` it shows, which the grade beside the diagram
// and the weight bars then follow, and `note` to show the note on what the area means.
// The weight bars sit beneath the diagram, lined up with its bins so they name them.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VIEW, DIAGRAM_SPAN, ALONE_SPAN, TALL, SQUAT, spanOf, assessmentTypeFrame, coFrame, assessmentTypeTrajectory, assessmentTypeSilhouette, coSilhouette } from "./scenes.js";
import { scatterFrame, groupFrame, rowFrame, networkFrame } from "./pool.js";
import { assessmentTypeModel, coModel, format } from "./grading.js";
import { pastelFill } from "./palette.js";
import { explainerPresets, earlySemester, sparseOutcome } from "./data.js";

const POOL_VIEW = { w: 640, h: 600 }; // narrow, leaving the text beside it room
// The sized-scores page draws both models as bins of bars sized by score.
const sized = document.body.dataset.variant === "sized";
const SPAN = sized ? ALONE_SPAN : DIAGRAM_SPAN; // where the diagram's bins run across the panel
// The CO diagram is much wider and shorter (squat) on the sized page.
const CO_LAYOUT = sized ? SQUAT : TALL;
const CO_VIEW = CO_LAYOUT.view;
const CO_SPAN = sized ? spanOf(CO_LAYOUT) : DIAGRAM_SPAN;
const PAUSE = 1600; // between frames of a sequence, unless a frame sets its own `hold`
const NOTHING = { rects: [], paths: [], lines: [], tokens: [], texts: [] };
const MIN_SHARE = 0.1; // no category can be dragged below this share of the grade

/** The diagram's own timing bounces scores into place; here they glide. */
const calm = (frame) => ({ ...frame, ease: "smooth", duration: 1200, stagger: 10 });

/** How high the diagram's categories sit, on average, so the row of circles can wait at that height. */
function categoryHeight(frame) {
  const cats = frame.rects.filter((r) => /^(?:bin|t)-/.test(r.key) && r.w > 0);
  return cats.reduce((a, r) => a + r.y + r.h / 2, 0) / Math.max(1, cats.length);
}

/** The circles in a row, in the order the bins (or cells) will be, at the height the diagram's categories sit. */
// Sized on a fixed scale, so dragging one edge of the weight bar moves only the two circles beside it.
const inRow = (groups, diagram, view = VIEW, span = SPAN) => rowFrame(groups, view, { span, y: categoryHeight(diagram) }, { labels: true, minShare: MIN_SHARE });

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
function withMultipliers(course, frame, only = () => true) {
  const badges = frame.tokens.filter((t) => !t.copyOf && sourceOf(course, t)?.multiplier > 1 && only(t)).map((t) => ({
    key: `mult-${t.key}`, x: t.x - (t.w ?? t.size) / 2 + 2, y: t.y - (t.h ?? t.size) / 2 - 7,
    // White on the sized page, where the badges sit inside the dark bins.
    text: `${sourceOf(course, t).multiplier}×`, size: 11, cls: `multiplier-badge${sized ? " multiplier-badge--on-dark" : ""}`,
  }));
  return { ...frame, texts: [...frame.texts, ...badges] };
}

const coDiagram = (c, stage = "fill", extra = {}) => coFrame(c, stage, { fixedBins: true, sized, alone: true, layout: CO_LAYOUT, ...extra });
/** The CO diagram with the scores counted once faded, and the multiplied ones labelled. */
const multipliedFrame = (c) => ({ ...withMultipliers(c, multipliedOnly(c, coDiagram(c))), duration: 600, stagger: 0 });
const atDiagram = (c, stage = "fill", extra = {}) => assessmentTypeFrame(c, stage, { sized, alone: true, ...extra });

/** Each category's scores melt into their average. */
const within = (diagram) => (c) => [{ ...calm(diagram(c)), hold: 300 }, diagram(c, "melt")];

/**
 * Each category melts into its average, the categories close up into one shape as wide as their weights,
 * then it melts into a rectangle as tall as the overall grade.
 */
const overall = (diagram, shape) => (c) => [
  { ...calm(diagram(c)), hold: 300 },
  { ...diagram(c, "melt"), hold: 2200 },
  { ...shape(c, { byCategory: true }), note: true, hold: 1400 },
  { ...shape(c, { melted: true }), note: true },
];

const early = (course) => ({ ...course, scores: earlySemester });

const sparse = (course) => ({ ...course, scores: sparseOutcome });

/** The course with one assessment type's scores counted only once. */
const countedOnce = (course, typeId) => ({
  ...course, assessmentTypes: course.assessmentTypes.map((t) => (t.id === typeId ? { ...t, multiplier: 1 } : t)),
});

/** The session a token's score came from. */
const sessionOf = (course, token) => course.scores.find((s) => s.id === (token.copyOf ?? token.key))?.session;

/** Spotlight one session's scores: the rest fade, and its multiplied scores are labelled "2×", "3×", …. */
function spotlight(course, sessionId, frame) {
  const own = (t) => sessionOf(course, t) === sessionId;
  return withMultipliers(course, { ...frame, tokens: frame.tokens.map((t) => (own(t) ? t : { ...t, opacity: 0.2 })) }, own);
}

/**
 * The CO model's semester from its start, stressing the multiplying: each session's scores arrive in turn, and an
 * assignment's scores first land once, then multiply, their copies springing out of them while the rest fade and
 * they're labelled "2×", "3×", …; then the diagram returns to normal. It starts and ends on the plain diagram.
 */
function coSemester(course) {
  const running = (c) => coDiagram(c, "fill", { running: true });
  const step = (frame, c, timing) => ({ ...frame, ease: "smooth", duration: 450, stagger: 0, hold: 650, course: c, grade: coModel(c).final, ...timing });
  const empty = { ...course, scores: [] };
  const frames = [step(running(empty), empty)];
  course.sessions.forEach((session, i) => {
    const held = new Set(course.sessions.slice(0, i + 1).map((s) => s.id));
    const sofar = { ...course, scores: course.scores.filter((s) => held.has(s.session)) };
    const multiplier = course.assessmentTypes.find((t) => t.id === session.type)?.multiplier ?? 1;
    if (multiplier > 1) {
      const once = countedOnce(sofar, session.type);
      frames.push(step(running(once), once, { hold: 700 }));
      frames.push(step(spotlight(course, session.id, running(sofar)), sofar, { duration: 800, hold: 1600 }));
    }
    frames.push(step(running(sofar), sofar));
  });
  return frames;
}

/** The semester from its start: the diagram with each session's scores arriving in turn, and the grade so far. */
function semester(course, diagram, model) {
  return [{ sessions: [] }, ...course.sessions.map((_, i) => ({ sessions: course.sessions.slice(0, i + 1) }))].map(({ sessions }) => {
    const held = new Set(sessions.map((s) => s.id));
    const sofar = { ...course, scores: course.scores.filter((s) => held.has(s.session)) };
    return { ...diagram(sofar, "fill", { running: true }), ease: "smooth", duration: 450, stagger: 0, hold: 650, course: sofar, grade: model(sofar).final };
  });
}

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
      // The circles are sized by their weights; from the next step on, the weight bars show to change them.
      circles: { float: true, frames: (c) => groupFrame(byMedium(c), VIEW, { labels: true, weighted: true }) },
      fixed: { show: "bar", float: true, frames: (c) => inRow(byMedium(c), atDiagram(c)) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byMedium(c), atDiagram(c)), atDiagram(c)),
        within: within(atDiagram),
        overall: overall(atDiagram, assessmentTypeSilhouette),
      },
      unfold: {
        show: "bar grade",
        frames: (c) => calm(atDiagram(c)),
        grade: (c) => assessmentTypeModel(c).final,
        unfold: (c) => semester(c, atDiagram, assessmentTypeModel),
      },
      // From here on the example is back at its default weights and can't be edited.
      staircase: { reset: true, frames: (c) => assessmentTypeTrajectory(c) },
      // Early in the semester: the assignments still to come are hatched out, empty.
      early: {
        show: "bar grade",
        frames: (c) => ({ ...calm(atDiagram(early(c))), course: early(c) }),
        grade: (c) => assessmentTypeModel(early(c)).final,
      },
    },
  },
  co: {
    view: CO_VIEW,
    span: spanOf(CO_LAYOUT), // where the weight bars and the hover line up
    scenes: {
      photo: { show: "photo", frames: () => NOTHING },
      // From the assessments' circles to the COs', where each score is joined to its LO, like a network.
      circles: {
        float: true,
        frames: (c) => [groupFrame(byMedium(c), CO_VIEW, { labels: true, weighted: true }), networkFrame(byPurpose(c), CO_VIEW)],
      },
      fixed: { show: "bar", float: true, frames: (c) => inRow(byPurpose(c), coDiagram(c), CO_VIEW, CO_SPAN) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byPurpose(c), coDiagram(c), CO_VIEW, CO_SPAN), coDiagram(c)),
        within: within(coDiagram),
        overall: overall(coDiagram, (c, options) => coSilhouette(c, { ...options, layout: CO_LAYOUT })),
      },
      multiplied: { show: "bar", frames: (c) => multipliedFrame(c) },
      // Back to the plain diagram; the button plays the semester, ending there too.
      unfold: { show: "bar grade", frames: (c) => calm(coDiagram(c)), grade: (c) => coModel(c).final, unfold: coSemester },
      sparse: {
        show: "grade", reset: true,
        frames: (c) => calm(coDiagram(sparse(c))),
        grade: (c) => coModel(sparse(c)).final,
      },
      visualise: { show: "placeholder", reset: true, frames: () => NOTHING },
    },
  },
};

function createStory(section, { view, span = ALONE_SPAN, scenes }) {
  const figure = section.querySelector(".story__figure");
  const svg = figure.querySelector(".panel svg");
  const chart = createChart(svg, view);
  const store = createStore(explainerPresets);
  const bars = [...figure.querySelectorAll(".weights__bar")].map((el) => createWeightBar(el, store, el.dataset.list, { horizontal: Boolean(el.closest(".panel")), min: MIN_SHARE }));
  // Bars beneath the diagram line up with it (the old version's bars stand beside it instead).
  const weights = figure.querySelector(".panel .story__weights");
  const grade = figure.querySelector(".story__grade-value");
  const note = figure.querySelector(".story__note");
  let scene = null;
  let leaving = null; // the scene just scrolled back up out of, if any
  let timer = null;

  function showGrade(value) {
    if (!grade || value === undefined) return;
    grade.textContent = format(value);
    grade.style.background = value === null ? "" : pastelFill(value);
  }

  /** Draw the scene; after an edit, jump straight to the end of its sequence. */
  function draw({ replay = true } = {}) {
    const course = store.get();
    let frames = [].concat(scenes[scene].frames(course));
    // Scrolling back up undoes the scene being left, frame by frame, then settles on this scene's last frame.
    if (leaving) frames = [...[].concat(scenes[leaving].frames(course)).slice(0, -1).reverse(), frames.at(-1)];
    play(frames, replay ? 0 : frames.length - 1);
  }

  /**
   * Play frames one after another from `from`, each held for its `hold`. The grade beside the diagram, the weight bars
   * and the note follow each frame (the scene's own grade and the example as it is, unless the frame says otherwise).
   */
  function play(frames, from = 0) {
    clearTimeout(timer);
    const frame = frames[from];
    chart.render(frame);
    showGrade("grade" in frame ? frame.grade : scenes[scene].grade?.(store.get()));
    bars.forEach((b) => b.render(frame.course));
    if (note) note.hidden = !frame.note;
    if (from + 1 < frames.length) timer = setTimeout(() => play(frames, from + 1), frame.hold ?? PAUSE);
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
    if (scene) draw({ replay: entering });
    else bars.forEach((b) => b.render());
    entering = false;
  });
  bars.forEach((b) => b.render());

  /**
   * Line the weight bars up beneath the diagram's bins, and the note above them, wherever the svg draws its viewBox.
   * Uses layout sizes, not the on-screen box, which the panel's entrance animation briefly scales.
   */
  function align() {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (!weights || !width) return;
    const scale = Math.min(width / view.w, height / view.h);
    const fit = svg.getAttribute("preserveAspectRatio") ?? "";
    const share = (min, max) => (fit.includes(min) ? 0 : fit.includes(max) ? 1 : 0.5);
    const left = (width - view.w * scale) * share("xMin", "xMax") + span.x * scale;
    const top = (height - view.h * scale) * share("YMin", "YMax");
    for (const el of [weights, note]) {
      if (!el) continue;
      el.style.left = `${left}px`;
      el.style.width = `${span.w * scale}px`;
    }
    weights.style.top = `${top + span.base * scale}px`;
    if (note) note.style.top = `${top + span.top * scale}px`;
  }
  new ResizeObserver(align).observe(svg);

  /* ---------- The step's buttons: averages, and a semester unfolding ---------- */

  section.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    enter(button.closest(".step").dataset.scene);
    play(scenes[scene][button.dataset.action](store.get()));
  });

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

document.querySelector('[data-story="co"]')?.classList.toggle("story--squat", CO_LAYOUT === SQUAT);
document.querySelectorAll("[data-story]").forEach((section) => createStory(section, STORIES[section.dataset.story]));
