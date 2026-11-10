// Entry point for the Understanding Grading Models page: three scrolling stories, each a sticky figure
// whose scene follows the step being read. A scene names what the figure shows besides the chart
// (`show`: photo, bar, grade, placeholder, or pair to show `pair`'s frame in a second panel beside the chart),
// whether its scores float, and the chart frame(s) to draw.
// Several frames play one after another, each held for its `hold`; scrolling back up plays them in reverse.
// `reset` puts the example back to its default weights first; `grade` gives the course grade to show beside the diagram.
// `silhouette`: the frame shown while the diagram is hovered (or tapped): its scores as one shape in a box, with a note
// on what the area means; given `{ melted: true }`, the same area levelled into a rectangle.
// `unfold`: the frames the step's "Watch a semester unfold" button plays.
// The weight bars sit beneath the diagram, lined up with its bins so they name them.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { createWeightBar } from "./weights.js";
import { VIEW, DIAGRAM_SPAN, ALONE_SPAN, TALL, SQUAT, spanOf, assessmentTypeFrame, coFrame, assessmentTypeTrajectory, assessmentTypeSilhouette, coSilhouette } from "./scenes.js";
import { scatterFrame, groupFrame, rowFrame, networkFrame } from "./pool.js";
import { assessmentTypeModel, coModel, format, percent } from "./grading.js";
import { pastelFill } from "./palette.js";
import { explainerPresets, earlySemester, sparseOutcome } from "./data.js";

const POOL_VIEW = { w: 640, h: 600 }; // narrow, leaving the text beside it room
// The sized-scores page draws both models as bins of bars sized by score.
const sized = document.body.dataset.variant === "sized";
const SPAN = sized ? ALONE_SPAN : DIAGRAM_SPAN; // where the diagram's bins run across the panel
// The Assessment Type diagram is much wider and shorter (squat); open the page with ?at=tall for the earlier shape.
const AT_LAYOUT = sized && new URLSearchParams(location.search).get("at") !== "tall" ? SQUAT : TALL;
const AT_VIEW = AT_LAYOUT.view;
const AT_SPAN = sized ? spanOf(AT_LAYOUT) : DIAGRAM_SPAN;
const PAUSE = 1600; // between frames of a sequence, unless a frame sets its own `hold`
const NOTHING = { rects: [], paths: [], lines: [], tokens: [], texts: [] };
const MIN_SHARE = 0.1; // no category can be dragged below this share of the grade
const MELT_HOLD = 500; // how long the silhouette keeps its shape before melting

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

const coDiagram = (c) => coFrame(c, "fill", { fixedBins: true, sized, alone: true });
/** The CO diagram with the scores counted once faded, and the multiplied ones labelled. */
const multipliedFrame = (c) => ({ ...withMultipliers(c, multipliedOnly(c, coDiagram(c))), duration: 600, stagger: 0 });
const atDiagram = (c) => assessmentTypeFrame(c, "fill", { sized, alone: true, layout: AT_LAYOUT });
const atTrajectory = (c) => assessmentTypeTrajectory(c, AT_LAYOUT);

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
  return { ...frame, texts: [...frame.texts, { key: "still-to-come", x: AT_VIEW.w / 2, y: 64, text: `Still to come: ${names.join(", ")}`, size: 13, anchor: "middle", cls: "label label--small" }] };
}
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
  const step = (frame, timing) => ({ ...frame, ease: "smooth", duration: 450, stagger: 0, hold: 650, ...timing });
  const frames = [step(coDiagram({ ...course, scores: [] }))];
  course.sessions.forEach((session, i) => {
    const held = new Set(course.sessions.slice(0, i + 1).map((s) => s.id));
    const sofar = { ...course, scores: course.scores.filter((s) => held.has(s.session)) };
    const multiplier = course.assessmentTypes.find((t) => t.id === session.type)?.multiplier ?? 1;
    if (multiplier > 1) {
      frames.push(step(coDiagram(countedOnce(sofar, session.type)), { hold: 700 }));
      frames.push(step(spotlight(course, session.id, coDiagram(sofar)), { duration: 800, hold: 1600 }));
    }
    frames.push(step(coDiagram(sofar)));
  });
  return frames;
}

/** The semester from its start: the diagram with each session's scores arriving in turn. */
function semester(course, diagram) {
  return [{ sessions: [] }, ...course.sessions.map((_, i) => ({ sessions: course.sessions.slice(0, i + 1) }))].map(({ sessions }) => {
    const held = new Set(sessions.map((s) => s.id));
    return { ...diagram({ ...course, scores: course.scores.filter((s) => held.has(s.session)) }), ease: "smooth", duration: 450, stagger: 0, hold: 650 };
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
    view: AT_VIEW,
    span: spanOf(AT_LAYOUT), // where the weight bars and the hover line up
    scenes: {
      photos: { show: "photo photo-right", frames: () => NOTHING },
      photo: { show: "photo", frames: () => NOTHING },
      // The circles are sized by their weights; from the next step on, the weight bars show to change them.
      circles: { float: true, frames: (c) => groupFrame(byMedium(c), AT_VIEW, { labels: true, weighted: true }) },
      fixed: { show: "bar", float: true, frames: (c) => inRow(byMedium(c), atDiagram(c), AT_VIEW, AT_SPAN) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byMedium(c), atDiagram(c), AT_VIEW, AT_SPAN), atDiagram(c)),
        silhouette: (c, options) => assessmentTypeSilhouette(c, { ...options, layout: AT_LAYOUT }),
      },
      unfold: { show: "bar", frames: (c) => calm(atDiagram(c)), unfold: (c) => semester(c, atDiagram) },
      // From here on the example is back at its default weights and can't be edited.
      staircase: { reset: true, frames: atTrajectory },
      // Early in the semester: the assignments still to come are left out, so what there is has room;
      // beside the diagram, the same scores stacked, where the few in-class scores stand tall.
      early: {
        show: "grade pair",
        frames: (c) => withStillToCome(early(c), calm(atDiagram(scoredOnly(early(c))))),
        pair: (c) => untitled(atTrajectory(early(c))),
        grade: (c) => assessmentTypeModel(early(c)).final,
      },
    },
  },
  co: {
    view: VIEW,
    scenes: {
      photo: { show: "photo", frames: () => NOTHING },
      // From the assessments' circles to the COs', where each score is joined to its LO, like a network.
      circles: {
        float: true,
        frames: (c) => [groupFrame(byMedium(c), VIEW, { labels: true, weighted: true }), networkFrame(byPurpose(c), VIEW)],
      },
      fixed: { show: "bar", float: true, frames: (c) => inRow(byPurpose(c), coDiagram(c)) },
      diagram: {
        show: "bar",
        frames: (c) => intoBins(inRow(byPurpose(c), coDiagram(c)), coDiagram(c)),
        silhouette: coSilhouette,
      },
      multiplied: { show: "bar", frames: (c) => multipliedFrame(c) },
      // Back to the plain diagram; the button plays the semester, ending there too.
      unfold: { show: "bar", frames: (c) => calm(coDiagram(c)), unfold: coSemester },
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
  const pairSvg = figure.querySelector(".story__pair svg");
  const pair = pairSvg && createChart(pairSvg, view);
  const store = createStore(explainerPresets);
  const bars = [...figure.querySelectorAll(".weights__bar")].map((el) => createWeightBar(el, store, el.dataset.list, { horizontal: Boolean(el.closest(".panel")), min: MIN_SHARE }));
  // Bars beneath the diagram line up with it (the old version's bars stand beside it instead).
  const weights = figure.querySelector(".panel .story__weights");
  const grade = figure.querySelector(".story__grade-value");
  const note = figure.querySelector(".story__note");
  let scene = null;
  let leaving = null; // the scene just scrolled back up out of, if any
  let timer = null;

  /** Draw the scene; after an edit, jump straight to the end of its sequence. */
  function draw({ replay = true } = {}) {
    clearTimeout(timer);
    silhouette(false, { redraw: false });
    const course = store.get();
    let frames = [].concat(scenes[scene].frames(course));
    // Scrolling back up undoes the scene being left, frame by frame, then settles on this scene's last frame.
    if (leaving) frames = [...[].concat(scenes[leaving].frames(course)).slice(0, -1).reverse(), frames.at(-1)];
    pair?.render(scenes[scene].pair?.(course) ?? NOTHING);
    const value = scenes[scene].grade?.(store.get()) ?? null;
    if (grade && value !== null) {
      grade.textContent = format(value);
      grade.style.background = pastelFill(value);
    }
    play(frames, replay ? 0 : frames.length - 1);
  }

  /** Play frames one after another from `from`, each held for its `hold`. */
  function play(frames, from = 0) {
    clearTimeout(timer);
    chart.render(frames[from]);
    if (from + 1 < frames.length) timer = setTimeout(() => play(frames, from + 1), frames[from].hold ?? PAUSE);
  }

  function enter(name) {
    if (name === scene) return;
    silhouette(false, { redraw: false });
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

  /* ---------- Silhouette: the area the scores cover ---------- */

  /** Show the scene's silhouette in place of its diagram, or put the diagram back (unless `redraw` is false). */
  function silhouette(on, { redraw = true } = {}) {
    if (figure.classList.contains("is-silhouette") === on) return;
    figure.classList.toggle("is-silhouette", on);
    if (note) note.hidden = !on;
    if (!redraw) return;
    const course = store.get();
    if (!on) return play([{ ...[].concat(scenes[scene].frames(course)).at(-1), duration: 500, stagger: 0 }]);
    // The scores close up into one shape, hold it for half a second, then melt into a rectangle of the same area.
    const shape = scenes[scene].silhouette(course);
    play([{ ...shape, hold: shape.duration + MELT_HOLD }, scenes[scene].silhouette(course, { melted: true })]);
  }

  /** Whether the pointer is over the bins (in the diagram's own units). */
  function overBins(e) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return p.x >= span.x && p.x <= span.x + span.w && p.y >= span.top && p.y <= span.base;
  }

  const canSilhouette = () => Boolean(note && scene && scenes[scene].silhouette);
  svg.addEventListener("pointermove", (e) => e.pointerType === "mouse" && canSilhouette() && silhouette(overBins(e)));
  svg.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && silhouette(false));
  // A tap turns it on and off, on touch screens.
  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && canSilhouette()) silhouette(overBins(e) && !figure.classList.contains("is-silhouette"));
  });

  /* ---------- Watch a semester unfold ---------- */

  section.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action='unfold']");
    if (!button) return;
    enter(button.closest(".step").dataset.scene);
    play(scenes[scene].unfold(store.get()));
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

document.querySelector('[data-story="at"]')?.classList.toggle("story--squat", AT_LAYOUT === SQUAT);
document.querySelectorAll("[data-story]").forEach((section) => createStory(section, STORIES[section.dataset.story]));
