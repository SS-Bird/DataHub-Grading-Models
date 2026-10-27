// Example courses used throughout the explainer (from the LA111 video).
// Sessions without scores are still to come. `presets` are offered as starting points; the first is the default.

const classes = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ id: `c${from + i}`, type: "class", name: `Class ${from + i}` }));

const partWay = {
  code: "LA111",

  // The semester in order. A class holds one score; an assignment holds several.
  sessions: [
    ...classes(1, 3),
    { id: "a1", type: "a1", name: "Assignment 1" },
    ...classes(4, 9),
    { id: "a2", type: "a2", name: "Assignment 2" },
    ...classes(10, 15),
    { id: "a3", type: "a3", name: "Assignment 3" },
  ],

  // Rubric scores (1–5) received so far.
  scores: [
    { id: "s1", session: "c1", lo: "Vocabulary", score: 2 },
    { id: "s2", session: "c2", lo: "Spelling", score: 4 },
    { id: "s3", session: "c3", lo: "Vocabulary", score: 2 },
    { id: "s4", session: "a1", lo: "Vocabulary", score: 3 },
    { id: "s5", session: "a1", lo: "Spelling", score: 4 },
    { id: "s6", session: "a1", lo: "Punctuation", score: 4 },
  ],

  // Assessment Type Model: share of the course grade per type.
  // CO Model: how many times each score from this type is counted.
  assessmentTypes: [
    { id: "class", name: "In-Class Scores", shortName: "Classes", weight: 0.3, multiplier: 1 },
    { id: "a1", name: "Assignment 1", shortName: "A1", weight: 0.15, multiplier: 2 },
    { id: "a2", name: "Assignment 2", shortName: "A2", weight: 0.25, multiplier: 3 },
    { id: "a3", name: "Assignment 3", shortName: "A3", weight: 0.3, multiplier: 4 },
  ],

  // Assessment Type Model: the broader groups the types sit in.
  groups: [
    { id: "in-class", name: "In-Class", types: ["class"] },
    { id: "assignments", name: "Assignments", types: ["a1", "a2", "a3"] },
  ],

  // CO Model: course outcomes, their share of the grade, and their LOs/HCs.
  outcomes: [
    { id: "expression", name: "Expression", weight: 0.6, los: ["Vocabulary", "Tone"] },
    { id: "grammar", name: "Grammar", weight: 0.4, los: ["Spelling", "Punctuation"] },
  ],

  // Short LO names for tight spaces.
  loShort: { Vocabulary: "Voc", Tone: "Tone", Spelling: "Spell", Punctuation: "Punc" },
};

/** Number scores s1, s2, … from [session, LO, score] rows. */
const scores = (rows) => rows.map(([session, lo, score], i) => ({ id: `s${i + 1}`, session, lo, score }));

const finished = {
  ...partWay,
  scores: scores([
    ["c1", "Vocabulary", 2], ["c2", "Spelling", 4], ["c3", "Vocabulary", 2],
    ["a1", "Vocabulary", 3], ["a1", "Spelling", 4], ["a1", "Punctuation", 4],
    ["c4", "Punctuation", 3], ["c5", "Tone", 4], ["c6", "Vocabulary", 3],
    ["c7", "Spelling", 2], ["c8", "Tone", 4], ["c9", "Tone", 3],
    ["a2", "Tone", 5], ["a2", "Punctuation", 3], ["a2", "Spelling", 3], ["a2", "Vocabulary", 4],
    ["c10", "Vocabulary", 4], ["c11", "Tone", 3], ["c12", "Spelling", 3],
    ["c13", "Punctuation", 4], ["c14", "Vocabulary", 2], ["c15", "Spelling", 3],
    ["a3", "Spelling", 2], ["a3", "Tone", 4], ["a3", "Punctuation", 4], ["a3", "Vocabulary", 4],
  ]),
  assessmentTypes: partWay.assessmentTypes.map((t) => (t.id === "a3" ? { ...t, multiplier: 5 } : t)),
  outcomes: partWay.outcomes.map((o) => ({ ...o, weight: { expression: 0.7, grammar: 0.3 }[o.id] })),
};

// A finished course where the models disagree by over half a grade: middling class scores, mostly on
// Expression LOs, and strong assignments, mostly on Grammar LOs. Assignments carry 70% in the AT model;
// in the CO model Expression carries 70%, and it is fed mainly by class scores.
const bigDifference = {
  ...partWay,
  scores: scores([
    ["c1", "Vocabulary", 2], ["c2", "Tone", 2], ["c3", "Vocabulary", 3],
    ["a1", "Spelling", 4], ["a1", "Punctuation", 4], ["a1", "Tone", 2],
    ["c4", "Tone", 2], ["c5", "Spelling", 3], ["c6", "Vocabulary", 3],
    ["c7", "Tone", 2], ["c8", "Vocabulary", 3], ["c9", "Tone", 3],
    ["a2", "Spelling", 4], ["a2", "Punctuation", 4], ["a2", "Vocabulary", 3],
    ["c10", "Vocabulary", 2], ["c11", "Tone", 2], ["c12", "Punctuation", 3],
    ["c13", "Vocabulary", 2], ["c14", "Tone", 3], ["c15", "Vocabulary", 3],
    ["a3", "Spelling", 5], ["a3", "Punctuation", 4], ["a3", "Spelling", 4],
  ]),
  outcomes: partWay.outcomes.map((o) => ({ ...o, weight: { expression: 0.7, grammar: 0.3 }[o.id] })),
};

export const presets = [
  { id: "part-way", name: "Part-way", course: partWay },
  { id: "finished", name: "Finished", course: finished },
  { id: "big-difference", name: "Big difference", course: bigDifference },
];

/* ---------- Understanding Grading Models page ---------- */

const poll = (n) => ({ id: `p${n}`, type: "poll", name: `Poll ${n}` });
const comment = (n) => ({ id: `k${n}`, type: "comment", name: `Class ${n} comment` });

// A finished course graded by medium: in-class polls and comments, then three assignments.
const explainer = {
  code: "Example",
  sessions: [
    poll(1), comment(1), poll(2), comment(2),
    { id: "essay", type: "essay", name: "Essay" },
    poll(3), comment(3), poll(4), comment(4),
    { id: "paper", type: "paper", name: "Research Paper" },
    poll(5), comment(5), poll(6), comment(6),
    { id: "final", type: "final", name: "Final Assignment" },
  ],
  scores: scores([
    ["p1", "LO 1", 3], ["k1", "LO 3", 2], ["p2", "LO 2", 3], ["k2", "LO 1", 4],
    ["essay", "LO 1", 3], ["essay", "LO 3", 3], ["essay", "LO 4", 2],
    ["p3", "LO 2", 4], ["k3", "LO 4", 3], ["p4", "LO 1", 3], ["k4", "LO 2", 4],
    ["paper", "LO 1", 4], ["paper", "LO 2", 4], ["paper", "LO 3", 3], ["paper", "LO 4", 3],
    ["p5", "LO 3", 4], ["k5", "LO 1", 4], ["p6", "LO 2", 3], ["k6", "LO 4", 4],
    ["final", "LO 1", 5], ["final", "LO 2", 4], ["final", "LO 3", 4], ["final", "LO 4", 4],
  ]),
  assessmentTypes: [
    { id: "poll", name: "Polls", shortName: "Polls", weight: 0.1, multiplier: 1 },
    { id: "comment", name: "Class Comments", shortName: "Comments", weight: 0.2, multiplier: 1 },
    { id: "essay", name: "Essay", shortName: "Essay", weight: 0.15, multiplier: 2 },
    { id: "paper", name: "Research Paper", shortName: "Paper", weight: 0.25, multiplier: 3 },
    { id: "final", name: "Final Assignment", shortName: "Final", weight: 0.3, multiplier: 4 },
  ],
  groups: [
    { id: "in-class", name: "In-Class", types: ["poll", "comment"] },
    { id: "assignments", name: "Assignments", types: ["essay", "paper", "final"] },
  ],
  outcomes: [
    { id: "technical", name: "Technical execution", weight: 0.6, los: ["LO 1", "LO 2"] },
    { id: "testing", name: "Testing and Documentation", weight: 0.4, los: ["LO 3", "LO 4"] },
  ],
  loShort: {},
};

export const explainerPresets = [{ id: "explainer", name: "Example", course: explainer }];

// Early in the semester: a good essay, but a couple of poor in-class scores (and two middling ones)
// pull the grade so far down to 2.67.
export const earlySemester = scores([
  ["p1", "LO 1", 2], ["k1", "LO 3", 1], ["p2", "LO 2", 3], ["k2", "LO 1", 2],
  ["essay", "LO 1", 4], ["essay", "LO 3", 4], ["essay", "LO 4", 5],
]);

// Plenty of Technical execution scores, but only a couple of poor ones in Testing and Documentation.
const testingLOs = explainer.outcomes.find((o) => o.id === "testing").los;
export const sparseOutcome = [
  ...explainer.scores.filter((s) => !testingLOs.includes(s.lo)),
  { id: "b1", session: "k1", lo: "LO 3", score: 1 },
  { id: "b2", session: "k3", lo: "LO 4", score: 2 },
];
