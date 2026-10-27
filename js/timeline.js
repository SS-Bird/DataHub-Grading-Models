// Interactive semester timeline. Classes jut up as single scores; assignments hang below as groups of scores.
// Sessions still to come are greyed out and packed closer together; only the next one can be filled in.
// Everything is edited in place: click a score to change it, a grey slot to add one.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { openPopover, closePopover } from "./popover.js";

const VIEW = { w: 1000, h: 300 };
const AXIS_Y = 130;
const STEM = 46;
const R = 15;
const CELL = 38;
const MAX_ROWS = 3;
const FUTURE = 0.4; // a future session takes this share of a past session's space
const SCORES = [1, 2, 3, 4, 5];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Make an SVG group behave like a button. */
function asButton(g, label, onActivate) {
  g.attr("tabindex", 0).attr("role", "button").attr("aria-label", label)
    .on("click", (e) => {
      e.stopPropagation();
      onActivate(e.currentTarget);
    })
    .on("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e.currentTarget);
      }
    });
  return g;
}

export function createTimeline(svg, store) {
  const root = d3.select(svg).attr("viewBox", `0 0 ${VIEW.w} ${VIEW.h}`);
  const future = root.append("rect").attr("class", "tl-future").attr("rx", 18);
  root.append("line").attr("class", "tl-axis").attr("x1", 20).attr("x2", VIEW.w - 20).attr("y1", AXIS_Y).attr("y2", AXIS_Y);
  const layer = root.append("g");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const seen = new Set(); // scores already drawn, so only new ones pop in
  let drawn = false;

  const course = () => store.get();
  const typeOf = (id) => course().assessmentTypes.find((t) => t.id === id);

  /* ---------- popovers ---------- */

  function editScore(id, anchor) {
    const session = course().sessions.find((s) => s.id === course().scores.find((x) => x.id === id).session);
    openPopover(anchor, `Edit score from ${session.name}`, function fill(pop) {
      const score = course().scores.find((s) => s.id === id);
      if (!score) return closePopover();
      pop.innerHTML = `
        <p class="popover__title">${session.name}</p>
        <div class="popover__scores" role="group" aria-label="Score">
          ${SCORES.map((n) => `<button type="button" class="swatch swatch--${n}" data-value="${n}" aria-pressed="${n === score.score}">${n}</button>`).join("")}
        </div>
        ${course().outcomes.map((co) => `
          <div class="popover__group" role="group" aria-label="${co.name} learning outcomes">
            <span class="popover__co">${co.name}</span>
            ${co.los.map((lo) => `<button type="button" class="chip" data-lo="${lo}" aria-pressed="${lo === score.lo}">${lo}</button>`).join("")}
          </div>`).join("")}
        ${store.canRemove(id) ? `<button type="button" class="popover__remove" data-remove>Remove score</button>` : ""}`;
      pop.onclick = (e) => {
        const button = e.target.closest("button");
        if (!button) return;
        if (button.dataset.value) store.editScore(id, { score: Number(button.dataset.value) });
        else if (button.dataset.lo) store.editScore(id, { lo: button.dataset.lo });
        else if ("remove" in button.dataset) return void (store.removeScore(id), closePopover());
        fill(pop);
        pop.querySelector(`[data-value="${button.dataset.value}"], [data-lo="${button.dataset.lo}"]`)?.focus();
      };
    });
  }

  function add(sessionId) {
    const id = store.addScore(sessionId);
    const el = id && svg.querySelector(`[data-score="${id}"]`);
    if (el) editScore(id, el);
  }

  function shake(el) {
    el.classList.remove("is-shaking");
    void el.getBoundingClientRect();
    el.classList.add("is-shaking");
  }

  /* ---------- drawing ---------- */

  function scoreToken(parent, score, x, y, r, label) {
    const g = parent.append("g").attr("class", "tl-token").attr("transform", `translate(${x},${y})`).attr("data-score", score.id);
    asButton(g, `${label}: ${score.lo}, score ${score.score}. Edit`, (el) => editScore(score.id, el));
    const inner = g.append("g").attr("class", `tl-token__inner token--score-${score.score}${drawn && !seen.has(score.id) ? " is-new" : ""}`);
    inner.append("circle").attr("r", r);
    inner.append("text").text(score.score);
    return g;
  }

  function addSlot(parent, x, y, r, label, sessionId) {
    const g = parent.append("g").attr("class", "tl-slot").attr("transform", `translate(${x},${y})`);
    asButton(g, label, () => add(sessionId));
    const inner = g.append("g").attr("class", "tl-slot__inner");
    inner.append("circle").attr("class", "tl-slot__pulse").attr("r", r);
    inner.append("circle").attr("r", r);
    inner.append("text").text("+");
  }

  function drawClass(g, session, state) {
    const [score] = store.scoresIn(session.id);
    const top = AXIS_Y - STEM;
    if (state === "future") {
      g.append("line").attr("class", "tl-stem").attr("y1", AXIS_Y).attr("y2", AXIS_Y - 16);
      g.append("circle").attr("class", "tl-dot").attr("cy", AXIS_Y - 20).attr("r", 5);
      return;
    }
    g.append("line").attr("class", "tl-stem").attr("y1", AXIS_Y).attr("y2", top);
    if (state === "next") return addSlot(g, 0, top - R, R, `Add a score for ${session.name}`, session.id);
    scoreToken(g, score, 0, top - R, R, session.name);
    g.append("text").attr("class", "tl-lo").attr("y", top - 2 * R - 12).text(course().loShort[score.lo] ?? score.lo);
  }

  function drawAssignment(g, session, state) {
    const type = typeOf(session.type);
    const scores = store.scoresIn(session.id);
    const cardY = AXIS_Y + 22;

    g.append("line").attr("class", "tl-stem").attr("y1", AXIS_Y).attr("y2", cardY);
    if (state === "future") {
      g.append("rect").attr("class", "tl-card").attr("x", -18).attr("y", cardY).attr("width", 36).attr("height", 36).attr("rx", 8);
      g.append("text").attr("class", "tl-name").attr("y", cardY + 18).text(type.shortName);
      return;
    }

    const cells = scores.length + 1; // the last cell adds a score
    const rows = Math.min(MAX_ROWS, cells);
    const cols = Math.ceil(cells / rows);
    const w = cols * CELL + 8;
    const h = 22 + rows * CELL;
    g.append("rect").attr("class", "tl-card").attr("x", -w / 2).attr("y", cardY).attr("width", w).attr("height", h).attr("rx", 10);
    g.append("text").attr("class", "tl-name").attr("y", cardY + 13).text(type.shortName);

    const cell = (j) => ({ x: -w / 2 + 4 + Math.floor(j / rows) * CELL + CELL / 2, y: cardY + 22 + (j % rows) * CELL + CELL / 2 - 5 });
    scores.forEach((score, j) => {
      const { x, y } = cell(j);
      scoreToken(g, score, x, y, R - 2, session.name);
      g.append("text").attr("class", "tl-lo tl-lo--small").attr("x", x).attr("y", y + R + 4).text(course().loShort[score.lo] ?? score.lo);
    });
    const { x, y } = cell(scores.length);
    addSlot(g, x, y, R - 2, `Add a score to ${session.name}`, session.id);
  }

  function render() {
    const { sessions } = course();
    const now = store.nowIndex();
    const units = sessions.map((_, i) => (i < now ? 1 : FUTURE));
    const unit = (VIEW.w - 80) / sum(units);
    const xs = units.map((u, i) => 40 + (sum(units.slice(0, i)) + u / 2) * unit);
    const state = (i) => (i < now ? "past" : i === now ? "next" : "future");
    const t = d3.transition().duration(drawn && !reduceMotion.matches ? 600 : 0).ease(d3.easeCubicInOut);

    const futureX = now < sessions.length ? 40 + sum(units.slice(0, now)) * unit - 6 : VIEW.w - 20;
    future.transition(t).attr("x", futureX).attr("y", 14).attr("width", Math.max(0, VIEW.w - 14 - futureX)).attr("height", VIEW.h - 28);

    layer.selectAll("g.session")
      .data(sessions, (d) => d.id)
      .join((enter) => enter.append("g").attr("transform", (d, i) => `translate(${xs[i]},0)`))
      .attr("class", (d, i) => `session is-${state(i)}`)
      .each(function (session, i) {
        const g = d3.select(this);
        g.selectAll("*").remove();
        if (session.type === "class") drawClass(g, session, state(i));
        else drawAssignment(g, session, state(i));
        if (state(i) === "future") asButton(g, `${session.name} hasn't happened yet`, shake).attr("aria-disabled", "true");
        else g.attr("tabindex", null).attr("role", null).attr("aria-label", null).on("click", null).on("keydown", null);
      })
      .transition(t)
      .attr("transform", (d, i) => `translate(${xs[i]},0)`);

    course().scores.forEach((s) => seen.add(s.id));
    drawn = true;
  }

  return { render };
}
