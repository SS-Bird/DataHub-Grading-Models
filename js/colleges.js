// Entry point for the Course Models Used by College page: a stream graph of how many courses each college graded
// with each model, semester by semester. Assessment Type courses stack up above the line, CO courses down below it,
// one band per college, largest colleges nearest the line. Recreated from a peer's chart, with its numbers below.
// A college keeps its college colour on both sides; bands are named directly where they have room, hovering a semester
// lists every college's counts, hovering a band picks it out, and the same numbers are in a table beneath.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const SEMESTERS = ["Fall 2023", "Spring 2024", "Fall 2024", "Spring 2025", "Fall 2025", "Spring 2026"];

/** Courses graded with each model, per college, per semester (in SEMESTERS order). */
const COUNTS = {
  AT: {
    "Arts and Humanities": [6, 6, 5, 6, 8, 7],
    "Business": [1, 4, 2, 4, 3, 4],
    "Computational Sciences": [3, 4, 3, 4, 5, 5],
    "Cornerstone": [5, 5, 5, 5, 5, 5],
    "Natural Sciences": [2, 2, 1, 1, 8, 7],
    "Social Sciences": [3, 5, 5, 6, 9, 9],
  },
  CO: {
    "Arts and Humanities": [2, 1, 3, 2, 0, 0],
    "Business": [5, 2, 4, 2, 4, 3],
    "Computational Sciences": [8, 8, 6, 9, 7, 8],
    "Cornerstone": [0, 0, 0, 0, 0, 0],
    "Natural Sciences": [6, 8, 7, 6, 0, 2],
    "Social Sciences": [5, 3, 4, 3, 2, 1],
  },
};

const SHORT = { "Arts and Humanities": "Arts & Humanities", "Computational Sciences": "Computational Sci." };

const MODELS = [
  { id: "AT", name: "Assessment Type", side: -1 },
  { id: "CO", name: "CO Based", side: 1 },
];

// Each college in its own colour from the college colour rubric, the same on both sides of the line.
// Cornerstone has no college colour, so it takes the brand grey. (The rubric's Sustainability, Umber #944a20, has no courses here.)
const COLOURS = {
  "Arts and Humanities": "#871d1a", // Jasper
  "Computational Sciences": "#125b6d", // Fennel
  "Natural Sciences": "#56662d", // Nightshade
  "Social Sciences": "#90702b", // Honey
  "Business": "#4a3279", // Violet
  "Cornerstone": "#595959", // brand grey
};

const VIEW = { w: 1000, h: 620 };
const M = { top: 60, right: 70, bottom: 40, left: 80 };
const MIN_LABEL = 18; // a band this thick (px) or more is named inside itself

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const totalOf = (college) => sum(MODELS.map((m) => sum(COUNTS[m.id][college])));
const colleges = Object.keys(COUNTS.AT).sort((a, b) => totalOf(b) - totalOf(a)); // largest first
const semesterTotal = (model, j) => sum(colleges.map((c) => COUNTS[model.id][c][j]));

const figure = document.querySelector(".college-chart");
const svg = d3.select(figure.querySelector("svg")).attr("viewBox", `0 0 ${VIEW.w} ${VIEW.h}`);
const tooltip = figure.querySelector(".college-chart__tooltip");

const x = d3.scalePoint(SEMESTERS, [M.left, VIEW.w - M.right]);
const mid = M.top + (VIEW.h - M.top - M.bottom) / 2;
const most = d3.max(MODELS, (m) => d3.max(SEMESTERS, (_, j) => semesterTotal(m, j)));
const perCourse = (mid - M.top) / (most * 1.18); // px per course, leaving room for the totals
const yOf = (model, courses) => mid + model.side * courses * perCourse;

/* ---------- Frame: semesters, the dividing line, which side is which ---------- */

const grid = svg.append("g").attr("class", "college-chart__grid");
grid.selectAll("line").data(SEMESTERS).join("line")
  .attr("x1", (s) => x(s)).attr("x2", (s) => x(s)).attr("y1", M.top - 12).attr("y2", VIEW.h - M.bottom);
grid.selectAll("text").data(SEMESTERS).join("text")
  .attr("x", (s) => x(s)).attr("y", M.top - 26).attr("text-anchor", "middle").text((s) => s);

/* ---------- Bands ---------- */

const area = (model) => d3.area()
  .x((_, j) => x(SEMESTERS[j]))
  .y0((d) => yOf(model, d[0]))
  .y1((d) => yOf(model, d[1]))
  .curve(d3.curveMonotoneX);

const bands = [];
const labels = []; // drawn after every band, so no band covers another's name
for (const model of MODELS) {
  const g = svg.append("g").attr("class", "college-chart__model");
  let below = SEMESTERS.map(() => 0);
  colleges.forEach((college) => {
    const counts = COUNTS[model.id][college];
    if (!sum(counts)) return; // a college with no courses on this side has no band
    const stack = counts.map((n, j) => [below[j], below[j] + n]);
    below = stack.map((d) => d[1]);
    const path = g.append("path")
      .attr("class", "college-chart__band")
      .attr("d", area(model)(stack))
      .attr("fill", COLOURS[college]);
    bands.push({ model, college, path });

    // Named where the band is thickest, if it has room there.
    const j = d3.maxIndex(counts);
    if (counts[j] * perCourse >= MIN_LABEL) {
      const labelX = Math.min(Math.max(x(SEMESTERS[j]), M.left + 75), VIEW.w - M.right - 75);
      labels.push({ college, x: labelX, y: yOf(model, (stack[j][0] + stack[j][1]) / 2) });
    }
  });

  // Each semester's total, beyond the edge of its stack.
  g.selectAll("text.college-chart__total").data(SEMESTERS).join("text")
    .attr("class", "college-chart__total")
    .attr("x", (s) => x(s))
    .attr("y", (_, j) => yOf(model, semesterTotal(model, j)) + model.side * 14)
    .attr("text-anchor", "middle").attr("dominant-baseline", "central")
    .text((_, j) => semesterTotal(model, j));

  // Which side is which, along the left edge.
  svg.append("text")
    .attr("class", "college-chart__side")
    .attr("transform", `translate(28, ${(mid + yOf(model, most)) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text(model.side < 0 ? `${model.name} ↑` : `↓ ${model.name}`);
}

svg.append("line").attr("class", "college-chart__divide")
  .attr("x1", M.left - 20).attr("x2", VIEW.w - M.right + 10).attr("y1", mid).attr("y2", mid);

/* ---------- Hover: a semester's counts, and the band under the pointer picked out ---------- */

const crosshair = svg.append("line").attr("class", "college-chart__crosshair").attr("y1", M.top - 12).attr("y2", VIEW.h - M.bottom);
crosshair.attr("visibility", "hidden");

function showSemester(j, band, event) {
  const s = SEMESTERS[j];
  crosshair.attr("x1", x(s)).attr("x2", x(s)).attr("visibility", "visible");
  bands.forEach((b) => b.path.classed("is-faded", band !== null && b !== band));
  const rows = colleges.map((c) => `
    <tr${band?.college === c ? ' class="is-picked"' : ""}><th scope="row">${c}</th>${MODELS.map((m) => `<td>${COUNTS[m.id][c][j]}</td>`).join("")}</tr>`).join("");
  tooltip.innerHTML = `
    <p class="college-chart__tooltip-title">${s}</p>
    <table>
      <thead><tr><th scope="col">College</th>${MODELS.map((m) => `<th scope="col">${m.id}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Total</th>${MODELS.map((m) => `<td>${semesterTotal(m, j)}</td>`).join("")}</tr></tfoot>
    </table>`;
  tooltip.hidden = false;
  const box = figure.getBoundingClientRect();
  const left = event.clientX - box.left;
  const flip = left > box.width / 2;
  tooltip.style.left = `${flip ? left - tooltip.offsetWidth - 16 : left + 16}px`;
  tooltip.style.top = `${Math.max(0, event.clientY - box.top - tooltip.offsetHeight / 2)}px`;
}

function hide() {
  crosshair.attr("visibility", "hidden");
  bands.forEach((b) => b.path.classed("is-faded", false));
  tooltip.hidden = true;
}

svg.on("pointermove", (event) => {
  const [px] = d3.pointer(event);
  const j = d3.minIndex(SEMESTERS, (s) => Math.abs(x(s) - px));
  const band = bands.find((b) => b.path.node() === event.target) ?? null;
  showSemester(j, band, event);
});
svg.on("pointerleave", hide);

// Light names (every college colour is dark), each edged in its band's colour so it still reads where it runs past the band.
svg.append("g").selectAll("text").data(labels).join("text")
  .attr("class", "college-chart__label college-chart__label--on-dark")
  .attr("x", (d) => d.x).attr("y", (d) => d.y)
  .attr("stroke", (d) => COLOURS[d.college])
  .attr("text-anchor", "middle").attr("dominant-baseline", "central")
  .text((d) => SHORT[d.college] ?? d.college);

/* ---------- Legend and table ---------- */

document.querySelector(".college-legend").innerHTML = colleges.map((c) => `
  <li>
    <span class="college-legend__swatch" style="background:${COLOURS[c]}"></span>
    ${c}
  </li>`).join("");

document.querySelector(".college-table").innerHTML = `
  <thead>
    <tr><th scope="col">Model</th><th scope="col">College</th>${SEMESTERS.map((s) => `<th scope="col">${s}</th>`).join("")}</tr>
  </thead>
  ${MODELS.map((m) => `
  <tbody>
    ${colleges.map((c, i) => `
    <tr>${i === 0 ? `<th scope="rowgroup" rowspan="${colleges.length + 1}">${m.name}</th>` : ""}<th scope="row">${c}</th>${COUNTS[m.id][c].map((n) => `<td>${n}</td>`).join("")}</tr>`).join("")}
    <tr class="college-table__total"><th scope="row">Total</th>${SEMESTERS.map((_, j) => `<td>${semesterTotal(m, j)}</td>`).join("")}</tr>
  </tbody>`).join("")}`;
