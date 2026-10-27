// Editable state: one copy of the example course, shared by both models,
// plus the rules for how the semester can be edited.

import { presets } from "./data.js";

const DEFAULT_SCORE = 3;
export const MIN_WEIGHT = 0.05;

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
  };
}
