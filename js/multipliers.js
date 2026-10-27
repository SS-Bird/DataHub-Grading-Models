// CO Model multipliers: how many times each assessment type's scores count. One chip per type;
// clicking a chip opens a small picker beside it.

import { openPopover } from "./popover.js";

const CHOICES = [1, 2, 3, 4, 5];

export function createMultipliers(list, store) {
  const typeOf = (id) => store.get().assessmentTypes.find((t) => t.id === id);

  function edit(typeId, anchor) {
    const type = typeOf(typeId);
    openPopover(anchor, `How many times ${type.name} scores count`, function fill(pop) {
      const { multiplier } = typeOf(typeId);
      pop.innerHTML = `
        <p class="popover__title">${type.name}</p>
        <div class="popover__scores" role="group" aria-label="Multiplier">
          ${CHOICES.map((n) => `<button type="button" class="chip chip--round" data-value="${n}" aria-pressed="${n === multiplier}">×${n}</button>`).join("")}
        </div>`;
      pop.onclick = (e) => {
        const value = e.target.closest("button")?.dataset.value;
        if (!value) return;
        store.setMultiplier(typeId, Number(value));
        fill(pop);
        pop.querySelector(`[data-value="${value}"]`)?.focus();
      };
    });
  }

  list.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-type]");
    if (chip) edit(chip.dataset.type, chip);
  });

  function render() {
    list.innerHTML = store.get().assessmentTypes.map((t) => `
      <li><button type="button" class="multiplier" data-type="${t.id}" aria-label="${t.name} scores count ×${t.multiplier}. Change">
        <span>${t.shortName}</span><b>×${t.multiplier}</b>
      </button></li>`).join("");
  }

  return { render };
}
