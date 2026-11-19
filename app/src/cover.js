// Neon Coast cover renderer: draws a multi-panel GTA-style poster onto any 2D canvas.
// Pure canvas, no network, no libraries. Every panel is drawn from a photo the user loaded
// on their own machine, graded with a sunset / neon colour pipeline, then lettered.

/** The export sizes the app offers, in pixels. */
export const SIZES = {
  portrait: { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  square: { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  landscape: { w: 1920, h: 1080, label: 'Landscape 1920 x 1080' },
};

/**
 * Panel layouts, in normalised coordinates over the photo area (the strip above the
 * title band). `poster` is the five-panel hero layout, `grid` a four-panel grid,
 * `fullbleed` one photo under the title.
 */
export const LAYOUTS = {
  poster: {
    label: 'Poster · hero + 4',
    panels: [
      { x: 0, y: 0, w: 0.55, h: 1 },
      { x: 0.55, y: 0, w: 0.45, h: 0.333 },
      { x: 0.55, y: 0.333, w: 0.225, h: 0.334 },
      { x: 0.775, y: 0.333, w: 0.225, h: 0.334 },
      { x: 0.55, y: 0.667, w: 0.45, h: 0.333 },
    ],
  },
  grid: {
    label: 'Grid · 2 x 2',
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  fullbleed: {
    label: 'Full bleed · one photo',
    panels: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
};

/** Colour grades: a top and bottom wash, a draw filter, and the title gradient. */
export const GRADES = {
  sunset: {
    label: 'Sunset',
    top: 'rgba(255, 178, 64, 0.55)',
    bottom: 'rgba(255, 46, 136, 0.6)',
    filter: 'saturate(1.25) contrast(1.08)',
    title: ['#ffe259', '#ff7e5f', '#ff4e8a', '#c86bff'],
  },
  neon: {
    label: 'Neon nights',
    top: 'rgba(0, 229, 255, 0.5)',
    bottom: 'rgba(255, 46, 136, 0.62)',
    filter: 'saturate(1.45) contrast(1.12)',
    title: ['#7df9ff', '#ff7ad9', '#ff2e88', '#b967ff'],
  },
  vice: {
    label: 'Vice gold',
    top: 'rgba(168, 85, 247, 0.55)',
    bottom: 'rgba(255, 120, 40, 0.62)',
    filter: 'saturate(1.3) contrast(1.1)',
    title: ['#fde68a', '#f59e0b', '#e879f9', '#8b5cf6'],
  },
  noir: {
    label: 'Noir pink',
    top: 'rgba(255, 255, 255, 0.25)',
    bottom: 'rgba(255, 46, 136, 0.55)',
    filter: 'grayscale(1) contrast(1.18) brightness(1.05)',
    title: ['#ffffff', '#ffd6e8', '#ff7ad9', '#ff2e88'],
  },
};

/** Fraction of the cover height the title band takes (poster / grid layouts). */
const BAND = 0.17;

/** Panel rectangles in pixels for a layout at a given cover size. */
export function panelRects(layout, w, h) {
  const def = LAYOUTS[layout] ?? LAYOUTS.poster;
  const photoH = def === LAYOUTS.fullbleed ? h : h * (1 - BAND);
  const gap = Math.max(2, Math.round(w * 0.006));
  return def.panels.map((p) => ({
    x: Math.round(p.x * w) + gap / 2,
    y: Math.round(p.y * photoH) + gap / 2,
    w: Math.round(p.w * w) - gap,
    h: Math.round(p.h * photoH) - gap,
  }));
}

/** A tile of halftone dots, built once per colour, reused as a fill pattern. */
const halftoneTiles = new Map();
function halftoneTile(color) {
  if (!halftoneTiles.has(color)) {
    const tile = document.createElement('canvas');
    tile.width = 14;
    tile.height = 14;
    const t = tile.getContext('2d');
    t.fillStyle = color;
    t.beginPath();
    t.arc(7, 7, 2.4, 0, Math.PI * 2);
    t.fill();
    halftoneTiles.set(color, tile);
  }
  return halftoneTiles.get(color);
}

/** A tile of film grain, built once and reused as a fill pattern. */
let grainTile = null;
function grainPattern(ctx) {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = 160;
    grainTile.height = 160;
    const g = grainTile.getContext('2d');
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainTile, 'repeat');
}

/**
 * Draws `img` into `rect` in cover-fit, scaled by `crop.zoom` and shifted by
 * `crop.ox` / `crop.oy` (fractions of the panel size, -0.5 to 0.5).
 */
export function drawPhotoInto(ctx, img, rect, crop) {
  const zoom = crop?.zoom ?? 1;
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (crop?.ox ?? 0) * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + (crop?.oy ?? 0) * rect.h;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** The placeholder drawn in an empty panel. */
function drawEmptyPanel(ctx, rect, n) {
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, '#3b1d5a');
  g.addColorStop(1, '#12081d');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let x = -rect.h; x < rect.w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(rect.x + x, rect.y + rect.h);
    ctx.lineTo(rect.x + x + rect.h, rect.y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.max(14, rect.w * 0.09)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PANEL ${n + 1}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** The sunset / neon grade wash over one panel, plus halftone and a soft vignette. */
function applyGrade(ctx, rect, grade) {
  const wash = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  wash.addColorStop(0, grade.top);
  wash.addColorStop(1, grade.bottom);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = grade.bottom;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = ctx.createPattern(halftoneTile('#ffffff'), 'repeat');
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  const vig = ctx.createRadialGradient(
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,2,20,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** A little neon sun with slits, drawn in the title band as the studio's own mark. */
function drawSunMark(ctx, cx, cy, r, grade) {
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#ffe259');
  g.addColorStop(0.55, '#ff7e5f');
  g.addColorStop(1, '#ff2e88');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a0b26';
  for (let i = 0; i < 3; i++) {
    const y = cy + r * (0.05 + i * 0.3);
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    ctx.fillRect(cx - half, y, half * 2, r * 0.11);
  }
  ctx.restore();
}

/** Fits `text` in Anton to at most `maxW`, returning the font size to use. */
function fitTitle(ctx, text, maxW, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  while (size > 20 && ctx.measureText(text).width > maxW) {
    size -= 4;
    ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  }
  return size;
}

/** The title band: dark band, gradient rule, big outlined title, neon script subtitle. */
function drawTitleBand(ctx, w, h, state, grade) {
  const bandH = h * BAND;
  const y0 = h - bandH;
  const bg = ctx.createLinearGradient(0, y0, 0, h);
  bg.addColorStop(0, '#1c0b2e');
  bg.addColorStop(1, '#12081d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, y0, w, bandH);
  const rule = ctx.createLinearGradient(0, 0, w, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.5, '#ffb240');
  rule.addColorStop(1, '#00e5ff');
  ctx.fillStyle = rule;
  ctx.fillRect(0, y0, w, Math.max(3, bandH * 0.03));

  const title = (state.title || 'UNTITLED').trim().toUpperCase();
  const size = fitTitle(ctx, title, w * 0.8, Math.round(bandH * 0.58));
  const cx = w / 2;
  const titleY = y0 + bandH * 0.52;
  const grad = ctx.createLinearGradient(cx - ctx.measureText(title).width / 2, 0, cx + ctx.measureText(title).width / 2, 0);
  grade.title.forEach((c, i) => grad.addColorStop(i / (grade.title.length - 1), c));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#14060f';
  ctx.lineWidth = Math.max(4, size * 0.13);
  ctx.strokeText(title, cx, titleY);
  ctx.fillStyle = grad;
  ctx.fillText(title, cx, titleY);

  const sub = (state.subtitle || '').trim();
  if (sub) {
    ctx.font = `${Math.round(bandH * 0.24)}px Pacifico, cursive`;
    ctx.fillStyle = '#7df9ff';
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = bandH * 0.14;
    ctx.fillText(sub, cx, y0 + bandH * 0.86);
    ctx.shadowBlur = 0;
  }
  // The sun mark only when the title leaves it room; a wide title takes the band.
  ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  if (ctx.measureText(title).width < w * 0.72) drawSunMark(ctx, w * 0.055, y0 + bandH * 0.52, bandH * 0.26, grade);
}

/**
 * Draws the whole cover onto `ctx` at W x H.
 * `state` is { photos, panels, layout, grade, title, subtitle } where panels[i] is
 * { photo: index into photos or null, zoom, ox, oy }.
 */
export function renderCover(ctx, w, h, state) {
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const rects = panelRects(state.layout, w, h);
  ctx.save();
  ctx.fillStyle = '#12081d';
  ctx.fillRect(0, 0, w, h);

  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? { photo: null, zoom: 1, ox: 0, oy: 0 };
    const img = panel.photo !== null && panel.photo !== undefined ? state.photos[panel.photo] : null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (img) {
      ctx.filter = grade.filter;
      drawPhotoInto(ctx, img, rect, panel);
      ctx.filter = 'none';
      applyGrade(ctx, rect, grade);
    } else {
      drawEmptyPanel(ctx, rect, i);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(2, w * 0.003);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  if (state.layout === 'fullbleed') {
    const scrim = ctx.createLinearGradient(0, h * 0.55, 0, h);
    scrim.addColorStop(0, 'rgba(18,8,29,0)');
    scrim.addColorStop(1, 'rgba(18,8,29,0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }
  drawTitleBand(ctx, w, h, state, grade);

  // Outer white frame, then grain and a full-cover vignette.
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(3, w * 0.005);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,2,20,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A fresh default state: five panels, the first photo everywhere until the user swaps. */
export function defaultState() {
  return {
    layout: 'poster',
    grade: 'sunset',
    size: 'portrait',
    title: 'Sunset Heist',
    subtitle: 'neon nights in the city',
    photos: [],
    panels: [0, 1, 2, 3, 4].map((photo) => ({ photo: null, zoom: 1, ox: 0, oy: 0 })),
  };
}
