// Rubric colours as fills, blended smoothly so an average like 3.4 gets a colour between 3 and 4:
// pastel (the same mix as --pastel-N in css/styles.css), for dark diagrams, or mellow (--mellow-N), for light ones.

const RUBRIC = ["#676767", "#df2f26", "#f0871e", "#33ab6f", "#0a78bf", "#5b3e97"];
const MIX = 0.32;
const MELLOW_MIX = 0.7;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const withWhite = (mix) => RUBRIC.map(rgb).map((c) => c.map((x) => x * mix + 255 * (1 - mix)));
const PASTEL = withWhite(MIX);
const MELLOW = withWhite(MELLOW_MIX);

function blend(colours, value) {
  const v = Math.min(5, Math.max(0, value));
  const lo = Math.floor(v);
  const hi = Math.min(5, lo + 1);
  const t = v - lo;
  const c = colours[lo].map((x, i) => Math.round(x + (colours[hi][i] - x) * t));
  return `rgb(${c.join(",")})`;
}

export const pastelFill = (value) => blend(PASTEL, value);
export const mellowFill = (value) => blend(MELLOW, value);
