// Pure grade calculations for both models. No DOM access here.

export const SCORE_MAX = 5;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);

export const format = (value) => (value === null ? "–" : value.toFixed(2));
export const percent = (weight) => `${Math.round(weight * 100)}%`;

/** Weighted average over parts that have a value; weights are renormalised. */
export function weightedAverage(parts) {
  const valid = parts.filter((p) => p.value !== null && p.weight > 0);
  const totalWeight = sum(valid.map((p) => p.weight));
  return {
    value: totalWeight ? sum(valid.map((p) => p.value * p.weight)) / totalWeight : null,
    totalWeight,
  };
}

function withAverage(group, scores) {
  return { ...group, scores, average: mean(scores.map((s) => s.score)) };
}

/** Scores with their assessment type (`source`) and order in the course attached. */
export function scoresWithSource(course) {
  const typeOf = new Map(course.sessions.map((s) => [s.id, s.type]));
  return course.scores.map((s, order) => ({ ...s, key: s.id, source: typeOf.get(s.session), order }));
}

export function assessmentTypeModel(course) {
  const scores = scoresWithSource(course);
  const types = course.assessmentTypes.map((type) => withAverage(type, scores.filter((s) => s.source === type.id)));
  const groups = course.groups.map((group) => {
    const members = types.filter((t) => group.types.includes(t.id));
    return {
      ...group,
      types: members,
      weight: sum(members.map((t) => t.weight)),
      average: weightedAverage(members.map((t) => ({ value: t.average, weight: t.weight }))).value,
    };
  });
  const final = weightedAverage(types.map((t) => ({ value: t.average, weight: t.weight })));
  return { scores, types, groups, final: final.value };
}

/** Repeat each score by its assessment type's multiplier. Copies get keys like "s4-x2". */
export function expandScores(course) {
  return scoresWithSource(course).flatMap((score) => {
    const { multiplier } = course.assessmentTypes.find((t) => t.id === score.source);
    return Array.from({ length: multiplier }, (_, i) => ({
      ...score,
      key: i === 0 ? score.id : `${score.id}-x${i + 1}`,
      copy: i,
      copyOf: i === 0 ? null : score.id,
    }));
  });
}

/** CO average is the simple mean of every (copied) score tagged to its LOs; LO weight is its share of that. */
export function coModel(course) {
  const expanded = expandScores(course);
  const outcomes = course.outcomes.map((co) => {
    const scores = expanded.filter((s) => co.los.includes(s.lo));
    const los = co.los.map((lo) => {
      const own = scores.filter((s) => s.lo === lo);
      return { ...withAverage({ id: lo, name: lo }, own), weight: scores.length ? (co.weight * own.length) / scores.length : 0 };
    });
    return { ...withAverage(co, scores), los };
  });
  const final = weightedAverage(outcomes.map((o) => ({ value: o.average, weight: o.weight })));
  return { expanded, outcomes, final: final.value };
}
