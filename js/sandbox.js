// "Try it yourself": the example's diagrams, filled with scores but not averaged, under the grade they give.
// Scores 0–5 can be dragged (or picked up with a click, then placed with a click) into any category,
// and any score in the diagrams can be clicked to remove it.
// It works on its own copy of the course, so nothing here changes the sections above.

import { createStore } from "./store.js";
import { createChart } from "./chart.js";
import { openPopover, closePopover } from "./popover.js";
import { VIEW, assessmentTypeFrame, coFrame } from "./scenes.js";

const SCORES = [0, 1, 2, 3, 4, 5];
const DRAG_THRESHOLD = 6;
const CATEGORIES = ["type", "lo"];
const SCORE = ["score"];

export function createSandbox(section, source, mode) {
  const store = createStore();
  store.set(source.get());
  source.subscribe((course) => store.set(course));

  const panels = [...section.querySelectorAll("[data-model]")].map((panel) => ({
    model: panel.dataset.model,
    svg: panel.querySelector("svg"),
    chart: createChart(panel.querySelector("svg"), VIEW),
    frame: panel.dataset.model === "at" ? assessmentTypeFrame : coFrame,
    targets: [],
  }));

  function render() {
    for (const p of panels) {
      const frame = p.frame(store.get(), "fill", { sandbox: true });
      p.targets = frame.targets;
      p.chart.render(frame);
    }
  }
  store.subscribe(render);

  /* ---------- Palette ---------- */

  const palette = section.querySelector(".palette");
  palette.innerHTML = SCORES.map((n) => `<button type="button" class="swatch swatch--${n}" data-score="${n}" aria-pressed="false" aria-label="Score ${n}: drag into a category, or click then click a category">${n}</button>`).join("");
  let held = null; // a score picked up by clicking, waiting to be placed

  function hold(score) {
    held = held === score ? null : score;
    palette.querySelectorAll("[data-score]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.score) === held)));
    section.classList.toggle("is-holding", held !== null);
  }

  /* ---------- Finding where a score lands ---------- */

  const highlight = document.createElement("div");
  highlight.className = "drop-highlight";
  highlight.hidden = true;
  document.body.append(highlight);

  const anchor = document.createElement("span");
  anchor.className = "drop-anchor";
  document.body.append(anchor);

  /** The target of one of these kinds under a point on screen, with its box in screen coordinates. */
  function targetAt(clientX, clientY, kinds) {
    for (const p of panels) {
      if (!p.svg.getClientRects().length) continue; // panel hidden for the unchosen model
      const ctm = p.svg.getScreenCTM();
      if (!ctm) continue;
      const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      const hit = p.targets.find((t) => kinds.includes(t.kind) && pt.x >= t.x && pt.x <= t.x + t.w && pt.y >= t.y && pt.y <= t.y + t.h);
      if (hit) {
        const a = new DOMPoint(hit.x, hit.y).matrixTransform(ctm);
        const b = new DOMPoint(hit.x + hit.w, hit.y + hit.h).matrixTransform(ctm);
        return { ...hit, screen: { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y } };
      }
    }
    return null;
  }

  function showHighlight(target) {
    highlight.hidden = !target;
    if (!target) return;
    highlight.classList.toggle("drop-highlight--remove", target.kind === "score");
    Object.assign(highlight.style, {
      left: `${target.screen.left + window.scrollX}px`,
      top: `${target.screen.top + window.scrollY}px`,
      width: `${target.screen.width}px`,
      height: `${target.screen.height}px`,
    });
  }

  /* ---------- Placing a score ---------- */

  const course = () => store.get();
  const los = () => course().outcomes.flatMap((o) => o.los);

  // A score needs both an assessment type (for the AT model and CO multipliers) and an LO (for the CO model).
  // The category it was dropped in gives one; ask for the other only when it matters.
  function place(score, target, clientX, clientY) {
    Object.assign(anchor.style, { left: `${clientX + window.scrollX}px`, top: `${clientY + window.scrollY}px` });
    if (target.kind === "type") {
      if (mode() === "at") return store.dropScore(target.id, los()[0], score);
      return ask(`Which learning outcome is this ${score} for?`, los().map((lo) => ({ label: lo, value: lo })),
        (lo) => store.dropScore(target.id, lo, score));
    }
    return ask(`Where did this ${score} come from?`,
      course().assessmentTypes.map((t) => ({ label: `${t.shortName} ×${t.multiplier}`, value: t.id })),
      (typeId) => store.dropScore(typeId, target.id, score));
  }

  function ask(question, options, answer) {
    openPopover(anchor, question, (pop) => {
      pop.innerHTML = `
        <p class="popover__title">${question}</p>
        <div class="popover__group">
          ${options.map((o, i) => `<button type="button" class="chip" data-i="${i}">${o.label}</button>`).join("")}
        </div>`;
      pop.onclick = (e) => {
        const i = e.target.closest("[data-i]")?.dataset.i;
        if (i === undefined) return;
        closePopover();
        answer(options[i].value);
      };
    });
  }

  /* ---------- Dragging from the palette ---------- */

  palette.addEventListener("pointerdown", (e) => {
    const chip = e.target.closest("[data-score]");
    if (!chip) return;
    e.preventDefault();
    const score = Number(chip.dataset.score);
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;

    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      if (!ghost) {
        ghost = chip.cloneNode(true);
        ghost.className = `swatch swatch--${score} drag-ghost`;
        document.body.append(ghost);
      }
      ghost.style.left = `${ev.clientX + window.scrollX}px`;
      ghost.style.top = `${ev.clientY + window.scrollY}px`;
      showHighlight(targetAt(ev.clientX, ev.clientY, CATEGORIES));
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      showHighlight(null);
      if (!ghost) return hold(score); // a click picks the score up instead
      ghost.remove();
      const target = targetAt(ev.clientX, ev.clientY, CATEGORIES);
      if (target) place(score, target, ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  // With a score picked up, clicking a category places it; otherwise clicking a score offers to remove it.
  section.addEventListener("pointermove", (e) => {
    if (e.buttons) return;
    showHighlight(targetAt(e.clientX, e.clientY, held === null ? SCORE : CATEGORIES));
  });
  section.addEventListener("pointerleave", () => showHighlight(null));
  section.addEventListener("click", (e) => {
    if (e.target.closest(".palette, button")) return;
    if (held === null) {
      const target = targetAt(e.clientX, e.clientY, SCORE);
      if (target) offerRemove(target, e.clientX, e.clientY);
      return;
    }
    const target = targetAt(e.clientX, e.clientY, CATEGORIES);
    if (!target) return;
    const score = held;
    hold(score);
    showHighlight(null);
    place(score, target, e.clientX, e.clientY);
  });

  function offerRemove(target, clientX, clientY) {
    Object.assign(anchor.style, { left: `${clientX + window.scrollX}px`, top: `${clientY + window.scrollY}px` });
    const scored = course().scores.find((s) => s.id === target.id);
    openPopover(anchor, `Remove this ${target.score}?`, (pop) => {
      pop.innerHTML = `
        <p class="popover__title">A ${target.score} for ${scored?.lo ?? "this score"}</p>
        <button type="button" class="popover__remove" data-remove>Remove score</button>`;
      pop.onclick = (e) => {
        if (!e.target.closest("[data-remove]")) return;
        closePopover();
        showHighlight(null);
        store.discardScore(target.id);
      };
    });
  }

  section.querySelector("[data-action='sandbox-reset']").addEventListener("click", () => store.set(source.get()));

  return { render };
}
