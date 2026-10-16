import { hashString as hash, seededRandom as rng } from "@openfutures/core";

/** Faceted portraits from the confirmed design, scoped to Copy and Points. */
var AV_BG = [
  "#123b8c",
  "#0e5560",
  "#41204f",
  "#1d4d38",
  "#8c3a1b",
  "#16233f",
  "#6e5712",
  "#7a2441",
  "#2b2f9e",
  "#2f3a2b",
];
var AV_SKIN = [
  "#dd3b61",
  "#ef6c4d",
  "#f2a53a",
  "#b765d4",
  "#2fb6a5",
  "#5b9dff",
  "#9fd23e",
  "#f1b79c",
  "#a2603f",
  "#cf9150",
];
var AV_FRAME = ["#f4c430", "#f6f6f4", "#ff7c2e", "#171717", "#5de6b4", "#ff7fb8"];
var AV_CLOTH = [
  "#f2f2f0",
  "#f2f2f0",
  "#e6d3b0",
  "#2a2d33",
  "#cfe3f0",
  "#f0c9c9",
  "#c0392b",
  "#2f6f4f",
];
var AV_HAIR = ["#141416", "#141416", "#3b2417", "#a8441c", "#d7d7d7"];
var AV_CACHE: Record<string, string> = {};
function avShade(hex: string, dl: number): string {
  var c = hex.replace("#", ""),
    r = parseInt(c.substr(0, 2), 16) / 255,
    g = parseInt(c.substr(2, 2), 16) / 255,
    b = parseInt(c.substr(4, 2), 16) / 255;
  var mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    h = 0,
    s = 0,
    d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  l = Math.max(0.04, Math.min(0.97, l + dl));
  return "hsl(" + Math.round(h) + " " + Math.round(s * 100) + "% " + Math.round(l * 100) + "%)";
}
export function leaderAvatar(seed: string): string {
  if (AV_CACHE[seed]) return AV_CACHE[seed];
  var r = rng(hash("av2" + seed)),
    pick = function (a: string[]) {
      return a[Math.floor(r() * a.length)];
    },
    j = function (v: number, a: number) {
      return +(v + (r() - 0.5) * 2 * a).toFixed(1);
    };
  var bg = pick(AV_BG),
    skin = pick(AV_SKIN),
    frame = pick(AV_FRAME),
    cloth = pick(AV_CLOTH),
    hair = pick(AV_HAIR);
  var head = Math.floor(r() * 8),
    glass = Math.floor(r() * 8),
    fh = Math.floor(r() * 6),
    flip = r() > 0.5;
  var o = "",
    P = function (pts: number[][], fill: string) {
      o +=
        '<path d="M' +
        pts
          .map(function (p: number[]) {
            return p[0] + " " + p[1];
          })
          .join("L") +
        'Z" fill="' +
        fill +
        '"/>';
    };
  var fan = function (
    c: number[],
    ring: number[][],
    shades: number[],
    base: string,
    closed: boolean,
  ) {
    for (var i = 0; i < ring.length - (closed ? 0 : 1); i++)
      P([c, ring[i], ring[(i + 1) % ring.length]], avShade(base, shades[i % shades.length]));
  };
  // face landmarks, facing right
  var T = [46, 16],
    F = [j(70, 2), j(25, 1.5)],
    B = [j(79, 1.5), j(41, 1.5)],
    N = [j(88.5, 2.5), j(62, 2.5)],
    U = [78, j(67, 1)],
    L = [77, j(74, 1)],
    C = [j(71, 2), j(87, 2)],
    Jw = [44, j(82, 2)],
    E = [34, 50],
    Q = [60, 52];
  // neck
  P(
    [
      [34, 58],
      [44, 82],
      [71, 86],
      [74, 100],
      [20, 100],
    ],
    avShade(skin, -0.24),
  );
  P(
    [
      [44, 82],
      [71, 86],
      [74, 100],
      [52, 100],
    ],
    avShade(skin, -0.3),
  );
  // face facets
  fan(
    Q,
    [E, T, F, B, N, U, L, C, Jw],
    [0.04, 0.1, 0.05, -0.02, -0.12, -0.06, -0.16, -0.2, -0.08],
    skin,
    true,
  );
  P([B, N, [73, 56]], avShade(skin, 0.07));
  // headwear
  var wrapRing = [
      [72, 24],
      [50, 8],
      [24, 22],
      [12, 56],
      [6, 100],
      [40, 100],
      [44, 70],
      [40, 48],
      [50, 36],
      [60, 30],
    ],
    wq = [36, 52];
  if (head <= 3) {
    fan(wq, wrapRing, [0.04, 0.08, -0.04, -0.1, -0.2, -0.12, -0.02, 0.02, 0.06, 0.1], cloth, true);
    P(
      [
        [24, 22],
        [12, 56],
        [34, 44],
      ],
      avShade(cloth, -0.14),
    );
    if (head === 3) {
      o +=
        '<path d="M31 21Q52 5 75 25" fill="none" stroke="#151515" stroke-width="3.2" stroke-linecap="round"/>';
    }
  } else if (head === 4) {
    fan(
      [52, 26],
      [
        [34, 40],
        [36, 18],
        [58, 8],
        [76, 20],
        [74, 32],
        [56, 29],
      ],
      [0.05, 0.1, 0.02, -0.06, -0.1, 0],
      cloth,
      true,
    );
    P(
      [
        [33, 41],
        [33, 31],
        [75, 33],
        [76, 40],
        [56, 38],
      ],
      avShade(cloth, 0.12),
    );
  } else if (head === 5) {
    fan(
      [54, 24],
      [
        [34, 38],
        [38, 14],
        [60, 8],
        [78, 20],
        [74, 30],
        [56, 28],
      ],
      [0.05, 0.1, 0.02, -0.06, -0.1, 0],
      cloth,
      true,
    );
    P(
      [
        [70, 24],
        [97, 35],
        [92, 40],
        [72, 32],
      ],
      avShade(cloth, -0.16),
    );
  } else if (head === 6) {
    fan(
      [52, 28],
      [
        [36, 40],
        [34, 16],
        [44, 24],
        [50, 4],
        [58, 22],
        [68, 8],
        [72, 26],
        [58, 32],
      ],
      [0.06, 0.1, -0.02, -0.08, 0.04, -0.04, -0.1, 0],
      hair,
      true,
    );
  } else {
    P(
      [
        [34, 52],
        [30, 30],
        [40, 14],
        [50, 22],
        [44, 44],
      ],
      avShade(skin, -0.1),
    );
  }
  // glasses
  var ax = 57,
    ay = 41,
    bx = 79,
    by = 43,
    lens = "#0c0c0f",
    sw = 3.4;
  if (glass <= 3) {
    o +=
      '<circle cx="' +
      ax +
      '" cy="' +
      ay +
      '" r="10.5" fill="' +
      lens +
      '" stroke="' +
      frame +
      '" stroke-width="' +
      sw +
      '"/><circle cx="' +
      bx +
      '" cy="' +
      by +
      '" r="8.6" fill="' +
      lens +
      '" stroke="' +
      frame +
      '" stroke-width="' +
      sw +
      '"/>';
    o +=
      '<path d="M67 40Q70 38 71 41" fill="none" stroke="' +
      frame +
      '" stroke-width="2.6" stroke-linecap="round"/><path d="M50 36Q52 33 56 33" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.6" stroke-linecap="round"/><path d="M74 40Q75 38 78 38" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.4" stroke-linecap="round"/>';
  } else if (glass === 4 || glass === 5) {
    o +=
      '<rect x="46" y="32" width="21" height="16" rx="3" fill="' +
      lens +
      '" stroke="' +
      frame +
      '" stroke-width="' +
      sw +
      '"/><rect x="70" y="34" width="17" height="14" rx="3" fill="' +
      lens +
      '" stroke="' +
      frame +
      '" stroke-width="' +
      sw +
      '"/><path d="M67 38H70" stroke="' +
      frame +
      '" stroke-width="2.6"/><path d="M50 36L58 36" stroke="#fff" stroke-opacity=".35" stroke-width="1.5" stroke-linecap="round"/>';
  } else if (glass === 6) {
    o +=
      '<path d="M44 34H89L86 49Q72 53 58 49Q50 47 46 44Z" fill="' +
      lens +
      '" stroke="' +
      frame +
      '" stroke-width="' +
      sw +
      '" stroke-linejoin="round"/><path d="M50 38H64" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>';
  } else {
    o +=
      '<circle cx="58" cy="41" r="2.4" fill="#16161a"/><circle cx="79" cy="43" r="2.1" fill="#16161a"/><path d="M52 35Q58 32 64 35M73 37Q79 34 85 38" fill="none" stroke="' +
      avShade(skin, -0.34) +
      '" stroke-width="2.4" stroke-linecap="round"/>';
  }
  // facial hair
  var fc = pick(AV_HAIR);
  if (fh === 0 || fh === 1)
    o += '<path d="M63 68Q70 61 78 66Q86 61 93 70Q86 70 78 71Q70 72 63 68Z" fill="' + fc + '"/>';
  else if (fh === 2)
    o += '<path d="M68 68Q74 64 79 67Q85 64 90 69Q84 70 79 70Q73 71 68 68Z" fill="' + fc + '"/>';
  else if (fh === 3) {
    o += '<path d="M68 68Q74 64 79 67Q85 64 90 69Q84 70 79 70Q73 71 68 68Z" fill="' + fc + '"/>';
    P(
      [
        [66, 80],
        [76, 77],
        [75, 88],
        [70, 90],
      ],
      fc,
    );
  } else if (fh === 4)
    o +=
      '<path d="M60 69Q68 59 78 65Q87 58 95 68Q99 72 93 73Q86 69 78 70Q70 71 60 69Z" fill="' +
      fc +
      '"/>';
  else o += '<path d="M71 75L81 74L79 78Z" fill="' + avShade(skin, -0.28) + '"/>';
  var body = flip ? '<g transform="translate(100 0) scale(-1 1)">' + o + "</g>" : o;
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    avShade(bg, 0.06) +
    '"/><stop offset="1" stop-color="' +
    avShade(bg, -0.08) +
    '"/></linearGradient><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="' +
    (hash(seed) % 90) +
    '"/><feColorMatrix values="0.6 0.6 0.6 0 -0.3 0.6 0.6 0.6 0 -0.3 0.6 0.6 0.6 0 -0.3 0 0 0 0 1"/></filter></defs><rect width="100" height="100" fill="url(#g)"/>' +
    body +
    '<rect width="100" height="100" filter="url(#n)" opacity=".36" style="mix-blend-mode:overlay"/></svg>';
  svg = svg
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return (AV_CACHE[seed] = "data:image/svg+xml;charset=utf-8," + svg);
}
