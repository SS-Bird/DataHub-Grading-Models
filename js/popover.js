// A small floating panel anchored to the element that opened it, for editing things in place.
// Closes on Escape or a click outside.

let current = null;

function place(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const left = Math.min(Math.max(8, a.left + a.width / 2 - p.width / 2), window.innerWidth - p.width - 8);
  const below = a.bottom + 10;
  const top = below + p.height > window.innerHeight - 8 ? a.top - p.height - 10 : below;
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${top + window.scrollY}px`;
}

export function closePopover({ restoreFocus = false } = {}) {
  if (!current) return;
  const { pop, anchor, onPointerDown, onKey } = current;
  current = null;
  pop.remove();
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKey);
  if (restoreFocus && anchor.isConnected) anchor.focus();
}

/** `build(pop)` fills the panel; call it again yourself to refresh the contents. */
export function openPopover(anchor, label, build) {
  closePopover();
  const pop = document.createElement("div");
  pop.className = "popover";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", label);
  document.body.append(pop);
  build(pop);
  place(pop, anchor);

  const onPointerDown = (e) => {
    if (!pop.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closePopover({ restoreFocus: true });
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKey);
  current = { pop, anchor, onPointerDown, onKey };

  pop.querySelector("[aria-pressed='true'], button")?.focus({ preventScroll: true });
}
