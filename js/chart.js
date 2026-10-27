// Generic SVG renderer: draws a frame ({ rects, paths, lines, links, tokens, outlines, texts }) and
// animates between frames, matching elements by `key`.
//
// Tokens are score markers: a rounded square that is a circle when `round` and a cube otherwise
// (`w`/`h` stretch a cube so it can join its neighbours). Outlines are paths drawn above the tokens.
// Rects with `fill` blend to that colour; `hatch` fills them with diagonal hatching.
// Links join two tokens (by key) and follow them as they move.
// A frame may set `ease`, `duration` and `stagger` (delay per unit of an element's `order`).
// Lines with `draw` trace themselves from start to end; `width` overrides their stroke width.
// Elements with `after` wait until the rest of their transition has finished.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const DURATION = 900;
const STAGGER = 30;
const EASES = { smooth: d3.easeCubicInOut, fall: d3.easeBounceOut, pop: d3.easeBackOut.overshoot(2) };

let nextId = 0;

const byKey = (d) => d.key;
const translate = (p) => `translate(${p.x},${p.y})`;

export function createChart(svg, view) {
  const root = d3.select(svg).attr("viewBox", `0 0 ${view.w} ${view.h}`);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Diagonal hatching for categories that have no scores yet.
  const hatch = `hatch-${++nextId}`;
  const pattern = root.append("defs").append("pattern")
    .attr("id", hatch).attr("patternUnits", "userSpaceOnUse")
    .attr("width", 8).attr("height", 8).attr("patternTransform", "rotate(45)");
  pattern.append("rect").attr("class", "hatch__bg").attr("width", 8).attr("height", 8);
  pattern.append("line").attr("class", "hatch__line").attr("y2", 8);

  const layer = (name) => root.append("g").attr("class", `layer layer--${name}`);
  const layers = {
    rects: layer("rects"), paths: layer("paths"), lines: layer("lines"),
    tokens: layer("tokens"), outlines: layer("outlines"), texts: layer("texts"),
  };

  // Last drawn position of every token and text, so new elements can grow out of an existing one (`from`).
  const positions = new Map();
  const origin = (d) => positions.get(d.from) ?? d;

  function render(frame) {
    const motion = !reduceMotion.matches;
    const duration = motion ? frame.duration ?? DURATION : 0;
    const t = root.transition().duration(duration).ease(EASES[frame.ease ?? "smooth"]);
    const delay = (d) => (motion ? (d.order ?? 0) * (frame.stagger ?? STAGGER) + (d.after ? duration : 0) : 0);
    const fadeOut = (exit) => exit.transition(t).attr("opacity", 0).remove();
    const rects = layers.rects.selectAll("rect")
      .data(frame.rects, byKey)
      .join(
        (enter) => enter.append("rect").attr("opacity", 0).attr("rx", (d) => d.rx ?? 0)
          .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w).attr("height", (d) => d.h),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => `area ${d.cls ?? ""}`);
    rects.transition(t).delay(delay)
      .attr("opacity", (d) => d.opacity ?? 1)
      .attr("rx", (d) => d.rx ?? 0)
      .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w).attr("height", (d) => d.h);
    // Colour runs on its own transition so it can blend from the class colour to `fill`.
    rects.filter((d) => d.hatch).interrupt("fill").style("fill", `url(#${hatch})`);
    rects.filter((d) => !d.hatch && !d.fill).interrupt("fill").style("fill", null);
    rects.filter((d) => !d.hatch && d.fill).transition("fill").duration(duration).delay(delay).style("fill", (d) => d.fill);

    layers.paths.selectAll("path")
      .data(frame.paths, byKey)
      .join(
        (enter) => enter.append("path").attr("opacity", 0).attr("d", (d) => d.d),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => d.cls ?? "")
      .transition(t).delay(delay)
      .attr("opacity", 1)
      .attr("d", (d) => d.d);

    layers.lines.selectAll("line.line")
      .data(frame.lines, byKey)
      .join(
        (enter) => enter.append("line").attr("opacity", 0)
          .attr("x1", (d) => d.x1).attr("y1", (d) => d.y1).attr("x2", (d) => d.x2).attr("y2", (d) => d.y2),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => `line ${d.cls ?? ""}`)
      .attr("pathLength", (d) => (d.draw ? 1 : null))
      .style("stroke-width", (d) => d.width ?? null)
      .style("animation-duration", (d) => (d.draw ? `${duration}ms` : null))
      .style("animation-delay", (d) => (d.draw ? `${delay(d)}ms` : null))
      .transition(t).delay(delay)
      .attr("opacity", 1)
      .attr("x1", (d) => d.x1).attr("y1", (d) => d.y1).attr("x2", (d) => d.x2).attr("y2", (d) => d.y2);

    // Links start where their tokens were last drawn and end where they are now.
    const tokenAt = new Map(frame.tokens.map((d) => [d.key, d]));
    const links = (frame.links ?? []).filter((l) => tokenAt.has(l.a) && tokenAt.has(l.b));
    const was = (key) => positions.get(key) ?? origin(tokenAt.get(key));
    layers.lines.selectAll("line.link")
      .data(links, byKey)
      .join(
        (enter) => enter.append("line").attr("opacity", 0)
          .attr("x1", (d) => was(d.a).x).attr("y1", (d) => was(d.a).y)
          .attr("x2", (d) => was(d.b).x).attr("y2", (d) => was(d.b).y),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => `link ${d.cls ?? ""}`)
      .transition(t).delay((d) => delay(tokenAt.get(d.b)))
      .attr("opacity", 1)
      .attr("x1", (d) => tokenAt.get(d.a).x).attr("y1", (d) => tokenAt.get(d.a).y)
      .attr("x2", (d) => tokenAt.get(d.b).x).attr("y2", (d) => tokenAt.get(d.b).y);

    layers.tokens.selectAll("g.token")
      .data(frame.tokens, byKey)
      .join(
        (enter) => {
          const g = enter.append("g").attr("opacity", 0).attr("transform", (d) => translate(origin(d)));
          g.append("rect").attr("width", 0).attr("height", 0);
          g.append("text");
          return g;
        },
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => `token ${d.cls ?? `token--score-${d.score}`}`)
      .call((g) => g.select("text").text((d) => d.text ?? d.score)
        .transition(t).delay(delay).attr("font-size", (d) => d.size * 0.55))
      .call((g) => g.select("rect").transition(t).delay(delay)
        .attr("x", (d) => -(d.w ?? d.size) / 2).attr("y", (d) => -(d.h ?? d.size) / 2)
        .attr("width", (d) => d.w ?? d.size).attr("height", (d) => d.h ?? d.size)
        .attr("rx", (d) => (d.round ? d.size / 2 : d.size * 0.14)))
      .transition(t).delay(delay)
      .attr("opacity", (d) => d.opacity ?? 1)
      .attr("transform", translate);

    layers.outlines.selectAll("path")
      .data(frame.outlines ?? [], byKey)
      .join(
        (enter) => enter.append("path").attr("opacity", 0).attr("d", (d) => d.d),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => d.cls ?? "")
      .attr("d", (d) => d.d)
      .transition().duration(motion ? 300 : 0).delay(delay)
      .attr("opacity", 1);

    layers.texts.selectAll("text")
      .data(frame.texts, byKey)
      .join(
        (enter) => enter.append("text").attr("opacity", 0)
          .attr("x", (d) => origin(d).x).attr("y", (d) => origin(d).y).attr("font-size", (d) => d.size ?? 14),
        (update) => update,
        fadeOut,
      )
      .attr("class", (d) => `text ${d.cls ?? ""}`)
      .attr("text-anchor", (d) => d.anchor ?? "start")
      .text((d) => d.text)
      .transition(t).delay(delay)
      .attr("opacity", 1)
      .attr("font-size", (d) => d.size ?? 14)
      .attr("x", (d) => d.x).attr("y", (d) => d.y);

    positions.clear();
    for (const d of [...frame.tokens, ...frame.texts]) positions.set(d.key, d);
  }

  return { render };
}
