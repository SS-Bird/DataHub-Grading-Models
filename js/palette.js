// Pastel versions of the rubric colours (the same mix as --pastel-N in css/styles.css),
// blended smoothly so an average like 3.4 gets a colour between 3 and 4.

const RUBRIC = ["#676767", "#df2f26", "#f0871e", "#33ab6f", "#0a78bf", "#5b3e97"];
const MIX = 0.32;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const PASTEL = RUBRIC.map((hex) => rgb(hex).map((c) => c * MIX + 255 * (1 - MIX)));

export function pastelFill(value) {
  const v = Math.min(5, Math.max(0, value));
  const lo = Math.floor(v);
  const hi = Math.min(5, lo + 1);
  const t = v - lo;
  const c = PASTEL[lo].map((x, i) => Math.round(x + (PASTEL[hi][i] - x) * t));
  return `rgb(${c.join(",")})`;
}
