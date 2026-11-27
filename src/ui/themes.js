// Themes are plain data: CSS variables for the board, the page and
// the two ball styles. Logic never reads them.

// Default UI and title font; a theme may override '--font'.
// The files are self-hosted (see @font-face in style.css).
export const FONT = "'Baloo 2', 'Helvetica Neue', Arial, sans-serif";

export const THEMES = {
  terracotta: {
    name: 'Terracotta',
    vars: {
      '--font': FONT,
      '--bg': '#f4ece0', '--text': '#3b2a20', '--muted': '#9b8573',
      '--btn': '#eadccb', '--btn-text': '#3b2a20', '--accent': '#d2643a',
      '--board': 'linear-gradient(135deg,#e9cfa4,#dcb985)',
      '--board-shadow': 'inset 0 2px 6px rgba(0,0,0,.12)',
      '--ball0': 'radial-gradient(circle at 34% 28%,#fff 0 6%,#fffaf0 18%,'
        + '#f3ead9 55%,#d2c2a6 100%)',
      '--ball1': 'radial-gradient(circle at 34% 28%,#fff 0 6%,#f3a27a 18%,'
        + '#d2643a 55%,#9c3f1f 100%)',
      '--ball-shadow': '0 3px 4px rgba(60,30,10,.30)',
      '--ring0': '#b89a70', '--ring1': '#5a3a22',
      '--ball-scale': '0.84', '--ball-radius': '50%',
    },
  },
  mono: {
    name: 'Black and white',
    vars: {
      '--font': FONT,
      '--bg': '#ededed', '--text': '#1c1c1c', '--muted': '#777',
      '--btn': '#dcdcdc', '--btn-text': '#1c1c1c', '--accent': '#1c1c1c',
      '--board': 'linear-gradient(135deg,#8a8a8a,#6f6f6f)',
      '--board-shadow': 'inset 0 2px 6px rgba(0,0,0,.3)',
      '--ball0': 'radial-gradient(circle at 34% 28%,#fff 0 6%,#fff 14%,'
        + '#e6e6e6 55%,#b5b5b5 100%)',
      '--ball1': 'radial-gradient(circle at 34% 28%,#8a8a8a 0 6%,#444 18%,'
        + '#1a1a1a 60%,#000 100%)',
      '--ball-shadow': '0 3px 4px rgba(0,0,0,.4)',
      '--ring0': '#222', '--ring1': '#eee',
      '--ball-scale': '0.84', '--ball-radius': '50%',
    },
  },
  billiard: {
    name: 'Billiard',
    vars: {
      '--font': FONT,
      '--bg': '#e8efe6', '--text': '#1f2e25', '--muted': '#6f857a',
      '--btn': '#d3e0d3', '--btn-text': '#1f2e25', '--accent': '#c8202a',
      '--board': 'linear-gradient(135deg,#2f8a5a,#1f6e45)',
      '--board-shadow': 'inset 0 3px 8px rgba(0,0,0,.35)',
      '--ball0': 'radial-gradient(circle at 34% 28%,#fff 0 7%,#fffdf5 20%,'
        + '#efe9d8 60%,#bdb6a2 100%)',
      '--ball1': 'radial-gradient(circle at 34% 28%,#fff 0 6%,#ff6a6a 16%,'
        + '#c8202a 55%,#6e0d14 100%)',
      '--ball-shadow': '0 3px 5px rgba(0,0,0,.45)',
      '--ring0': '#0d3d25', '--ring1': '#fff',
      '--ball-scale': '0.86', '--ball-radius': '50%',
    },
  },
};

export const THEME_ORDER = ['terracotta', 'mono', 'billiard'];

// --- Customise parts ---------------------------------------------------
// The look is four independent picks: ball A ("white balls"), ball B
// ("black balls"), board, background. Each option is plain data:
//   { id, name, vars, swatch }   plus, later, an optional
//   `unlock: { chapter: n }` (or similar) saying how it is earned.
// There is no progression logic yet: an option without `unlock` is open,
// and today none has one. Menus must call isUnlocked() so adding unlock
// info later needs no UI change.
const ballShade = (hi, mid, lo) => 'radial-gradient(circle at 34% 28%,'
  + `#fff 0 6%,${hi} 18%,${mid} 55%,${lo} 100%)`;

export const PARTS = {
  ballA: {
    label: 'White balls', var: '--ball0',
    options: [
      { id: 'cream', name: 'Cream', css: ballShade('#fffaf0', '#f3ead9', '#d2c2a6') },
      { id: 'pearl', name: 'Pearl', css: ballShade('#ffffff', '#e8e8ee', '#b5b5c4') },
      { id: 'mint', name: 'Mint', css: ballShade('#e6fbf0', '#b6e8cf', '#6fb597') },
      { id: 'sky', name: 'Sky', css: ballShade('#e8f3ff', '#b9d8f5', '#7aa6d1') },
      { id: 'gold', name: 'Gold', css: ballShade('#fff0b8', '#f0c85a', '#b8892a') },
      { id: 'rose', name: 'Rose', css: ballShade('#ffe8ee', '#f7bccb', '#cf7f95') },
    ],
  },
  ballB: {
    label: 'Black balls', var: '--ball1',
    options: [
      { id: 'terracotta', name: 'Terracotta', css: ballShade('#f3a27a', '#d2643a', '#9c3f1f') },
      { id: 'ink', name: 'Ink', css: 'radial-gradient(circle at 34% 28%,#8a8a8a 0 6%,#444 18%,#1a1a1a 60%,#000 100%)' },
      { id: 'cherry', name: 'Cherry', css: ballShade('#ff6a6a', '#c8202a', '#6e0d14') },
      { id: 'plum', name: 'Plum', css: ballShade('#c79ae0', '#7a3f9c', '#43195c') },
      { id: 'ocean', name: 'Ocean', css: ballShade('#7fc4e6', '#2478a8', '#0f3f63') },
      { id: 'forest', name: 'Forest', css: ballShade('#8fcf9a', '#2f8a4a', '#164a26') },
    ],
  },
  board: {
    label: 'Board', var: '--board',
    options: [
      { id: 'wood', name: 'Light wood', css: 'linear-gradient(135deg,#e9cfa4,#dcb985)',
        vars: { '--board-shadow': 'inset 0 2px 6px rgba(0,0,0,.12)', '--ring0': '#b89a70', '--ring1': '#5a3a22' } },
      { id: 'felt', name: 'Green felt', css: 'linear-gradient(135deg,#2f8a5a,#1f6e45)',
        vars: { '--board-shadow': 'inset 0 3px 8px rgba(0,0,0,.35)', '--ring0': '#0d3d25', '--ring1': '#fff' } },
      { id: 'slate', name: 'Slate', css: 'linear-gradient(135deg,#8a8a8a,#6f6f6f)',
        vars: { '--board-shadow': 'inset 0 2px 6px rgba(0,0,0,.3)', '--ring0': '#222', '--ring1': '#eee' } },
      { id: 'go', name: 'Go board', css: 'linear-gradient(135deg,#e8bd6a,#d3a24a)',
        vars: { '--board-shadow': 'inset 0 2px 6px rgba(80,40,0,.25)', '--ring0': '#7a5418', '--ring1': '#3a2608' } },
      { id: 'linen', name: 'Linen', css: 'linear-gradient(135deg,#d9d3c4,#c7bfab)',
        vars: { '--board-shadow': 'inset 0 2px 6px rgba(0,0,0,.14)', '--ring0': '#8a826e', '--ring1': '#3d3a30' } },
      { id: 'night', name: 'Midnight', css: 'linear-gradient(135deg,#2c3552,#1d2540)',
        vars: { '--board-shadow': 'inset 0 3px 8px rgba(0,0,0,.45)', '--ring0': '#0e1428', '--ring1': '#c9d3f5' } },
    ],
  },
  background: {
    label: 'Background', var: '--bg',
    options: [
      { id: 'cream', name: 'Cream', css: '#f4ece0',
        vars: { '--text': '#3b2a20', '--muted': '#9b8573', '--btn': '#eadccb', '--btn-text': '#3b2a20', '--accent': '#d2643a' } },
      { id: 'grey', name: 'Paper', css: '#ededed',
        vars: { '--text': '#1c1c1c', '--muted': '#777', '--btn': '#dcdcdc', '--btn-text': '#1c1c1c', '--accent': '#1c1c1c' } },
      { id: 'sage', name: 'Sage', css: '#e8efe6',
        vars: { '--text': '#1f2e25', '--muted': '#6f857a', '--btn': '#d3e0d3', '--btn-text': '#1f2e25', '--accent': '#2f8a5a' } },
      { id: 'sky', name: 'Mist', css: '#e6eef6',
        vars: { '--text': '#1f2b3a', '--muted': '#6c7f95', '--btn': '#d2deeb', '--btn-text': '#1f2b3a', '--accent': '#2f6fb0' } },
      { id: 'blush', name: 'Blush', css: '#f6e9ec',
        vars: { '--text': '#3a2230', '--muted': '#97768a', '--btn': '#ecd4db', '--btn-text': '#3a2230', '--accent': '#c2456f' } },
      { id: 'dusk', name: 'Dusk', css: '#1e2233',
        vars: { '--text': '#eceff8', '--muted': '#8e97b5', '--btn': '#2d3350', '--btn-text': '#eceff8', '--accent': '#e0805a' } },
    ],
  },
};

export const PART_ORDER = ['ballA', 'ballB', 'board', 'background'];

// Old single-theme presets expressed as four picks (also ?theme=...).
export const PRESETS = {
  terracotta: { ballA: 'cream', ballB: 'terracotta', board: 'wood', background: 'cream' },
  mono: { ballA: 'pearl', ballB: 'ink', board: 'slate', background: 'grey' },
  billiard: { ballA: 'cream', ballB: 'cherry', board: 'felt', background: 'sage' },
};
export const DEFAULT_LOOK = PRESETS.terracotta;

// Hook for later progression: options may carry `unlock`.
export function isUnlocked(option) {
  return !option.unlock;
}

export function findOption(part, id) {
  const list = PARTS[part].options;
  return list.find((o) => o.id === id) || list[0];
}

// Resolve any saved look (missing or stale ids fall back to defaults).
export function resolveLook(look) {
  const out = {};
  for (const part of PART_ORDER) {
    out[part] = findOption(part, (look || {})[part] || DEFAULT_LOOK[part]).id;
  }
  return out;
}

export function lookVars(look) {
  const l = resolveLook(look);
  const v = { '--font': FONT, '--ball-shadow': '0 3px 4px rgba(60,30,10,.35)',
    '--ball-scale': '0.84', '--ball-radius': '50%' };
  for (const part of PART_ORDER) {
    const o = findOption(part, l[part]);
    v[PARTS[part].var] = o.css;
    Object.assign(v, o.vars || {});
  }
  return v;
}

export function applyLook(look, root = document.documentElement) {
  const vars = lookVars(look);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', vars['--bg']);
}

export function applyTheme(id, root = document.documentElement) {
  applyLook(PRESETS[id] || DEFAULT_LOOK, root);
}
