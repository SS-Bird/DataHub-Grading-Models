// Editable state: one copy of the example course, shared by both models,
// plus the rules for how the semester can be edited.

import { presets } from "./data.js";

const DEFAULT_SCORE = 3;
export const MIN_WEIGHT = 0.05;
export const MAX_ASSIGNMENTS = 6;
export const MAX_LOS = 10;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** `starts` are the courses this store can load (re)start from; the first is the default. */
export function createStore(starts = presets) {
  const presetCourse = (id) => structuredClone(starts.find((p) => p.id === id).course);
  let preset = starts[0].id;
  let course = presetCourse(preset);
  const listeners = new Set();
  let nextId = 1;

  const emit = () => listeners.forEach((fn) => fn(course));
  const change = (mutate) => {
    mutate(course);
    emit();
  };

  const sessionIndex = (id) => course.sessions.findIndex((s) => s.id === id);
  const scoresIn = (sessionId) => course.scores.filter((s) => s.session === sessionId);

  /** Index of the first session still to come (sessions are filled in order). */
  function nowIndex() {
    const i = course.sessions.findIndex((s) => !scoresIn(s.id).length);
    return i === -1 ? course.sessions.length : i;
  }

  /** The next session can be started; assignments already under way can take more scores. */
  function canAdd(sessionId) {
    const i = sessionIndex(sessionId);
    const now = nowIndex();
    return i === now || (i < now && course.sessions[i].type !== "class");
  }

  /** Only the most recent session can be emptied; assignments can always lose a score while others remain. */
  function canRemove(scoreId) {
    const score = course.scores.find((s) => s.id === scoreId);
    if (!score) return false;
    const i = sessionIndex(score.session);
    return i === nowIndex() - 1 || (course.sessions[i].type !== "class" && scoresIn(score.session).length > 1);
  }

  return {
    get: () => course,
    subscribe: (fn) => listeners.add(fn),
    scoresIn,
    nowIndex,
    canAdd,
    canRemove,

    preset: () => preset,

    /** Start again from a preset course (the current one if none is given). */
    load(id = preset) {
      preset = id;
      course = presetCourse(id);
      emit();
    },

    /** Returns the new score's id, or null if the session can't take a score. */
    addScore(sessionId) {
      if (!canAdd(sessionId)) return null;
      const id = `u${nextId++}`;
      const previous = course.scores.at(-1);
      change((c) => c.scores.push({ id, session: sessionId, lo: previous?.lo ?? c.outcomes[0].los[0], score: DEFAULT_SCORE }));
      return id;
    },

    editScore(id, changes) {
      change((c) => Object.assign(c.scores.find((s) => s.id === id), changes));
    },

    removeScore(id) {
      if (!canRemove(id)) return;
      change((c) => {
        c.scores = c.scores.filter((s) => s.id !== id);
      });
    },

    /** Remove any score, ignoring the timeline's order rules (for Try It Yourself). */
    discardScore(id) {
      change((c) => {
        c.scores = c.scores.filter((s) => s.id !== id);
      });
    },

    /** Set the weights of "assessmentTypes" or "outcomes" (same order as the list). */
    setWeights(list, weights) {
      change((c) => c[list].forEach((item, i) => (item.weight = weights[i])));
    },

    /** Replace the whole course (e.g. to mirror another store). */
    set(next) {
      course = structuredClone(next);
      emit();
    },

    /**
     * Add a score to an assessment type without the timeline's order rules:
     * an assignment takes it directly; a class score fills the next empty class, or an extra class if none are left.
     */
    dropScore(typeId, lo, score) {
      change((c) => {
        let session = typeId === "class"
          ? c.sessions.find((s) => s.type === "class" && !c.scores.some((x) => x.session === s.id))
          : c.sessions.find((s) => s.type === typeId);
        if (!session) {
          const extra = c.sessions.filter((s) => s.type === "class").length + 1;
          session = { id: `c${extra}`, type: "class", name: `Class ${extra}` };
          c.sessions.push(session);
        }
        c.scores.push({ id: `u${nextId++}`, session: session.id, lo, score });
      });
    },

    /** Set each assessment-type group's total weight, scaling its types to keep their proportions. */
    setGroupWeights(weights) {
      change((c) => c.groups.forEach((g, i) => {
        const members = c.assessmentTypes.filter((t) => g.types.includes(t.id));
        const total = members.reduce((a, t) => a + t.weight, 0);
        members.forEach((t) => (t.weight = total ? (t.weight * weights[i]) / total : weights[i] / members.length));
      }));
    },

    setMultiplier(typeId, multiplier) {
      change((c) => (c.assessmentTypes.find((t) => t.id === typeId).multiplier = multiplier));
    },

    /* ---------- Class structure (Try It Yourself) ---------- */

    /** Add an assignment at the end of the semester, with an equal share of the weight taken from the others. */
    addAssignment(name) {
      if (course.assessmentTypes.filter((t) => t.id !== "class").length >= MAX_ASSIGNMENTS) return null;
      const id = `x${nextId++}`;
      change((c) => {
        const total = sum(c.assessmentTypes.map((t) => t.weight));
        const share = 1 / (c.assessmentTypes.length + 1);
        c.assessmentTypes.forEach((t) => (t.weight *= 1 - share));
        c.assessmentTypes.push({ id, name, shortName: name, weight: share * total, multiplier: 2 });
        c.sessions.push({ id, type: id, name });
        c.groups.find((g) => g.id === "assignments")?.types.push(id);
      });
      return id;
    },

    /** Remove an assignment and its scores; the others share out its weight. In-class scores can't be removed. */
    removeAssignment(id) {
      if (id === "class") return;
      change((c) => {
        const gone = c.assessmentTypes.find((t) => t.id === id);
        c.assessmentTypes = c.assessmentTypes.filter((t) => t !== gone);
        const rest = sum(c.assessmentTypes.map((t) => t.weight));
        c.assessmentTypes.forEach((t) => (t.weight *= (rest + gone.weight) / rest));
        const sessions = new Set(c.sessions.filter((s) => s.type === id).map((s) => s.id));
        c.sessions = c.sessions.filter((s) => !sessions.has(s.id));
        c.scores = c.scores.filter((s) => !sessions.has(s.session));
        c.groups.forEach((g) => (g.types = g.types.filter((t) => t !== id)));
      });
    },

    renameAssignment(id, name) {
      change((c) => {
        Object.assign(c.assessmentTypes.find((t) => t.id === id), { name, shortName: name });
        c.sessions.filter((s) => s.type === id).forEach((s) => (s.name = name));
      });
    },

    /** Add an LO to a course outcome. LOs are known by name, so names must be unique. */
    addLO(outcomeId, name) {
      const all = course.outcomes.flatMap((o) => o.los);
      if (all.length >= MAX_LOS || all.includes(name)) return false;
      change((c) => c.outcomes.find((o) => o.id === outcomeId).los.push(name));
      return true;
    },

    /** Remove an LO and its scores; the last LO stays, since every score needs one. */
    removeLO(lo) {
      if (course.outcomes.flatMap((o) => o.los).length <= 1) return;
      change((c) => {
        c.outcomes.forEach((o) => (o.los = o.los.filter((x) => x !== lo)));
        c.scores = c.scores.filter((s) => s.lo !== lo);
        delete c.loShort[lo];
      });
    },

    renameOutcome(id, name) {
      change((c) => (c.outcomes.find((o) => o.id === id).name = name));
    },

    /** Returns false if the name is empty or already taken. */
    renameLO(lo, name) {
      if (!name || course.outcomes.some((o) => o.los.includes(name))) return false;
      change((c) => {
        c.outcomes.forEach((o) => (o.los = o.los.map((x) => (x === lo ? name : x))));
        c.scores.forEach((s) => (s.lo = s.lo === lo ? name : s.lo));
        delete c.loShort[lo];
      });
      return true;
    },
  };
}
