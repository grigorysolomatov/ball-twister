// Themes are plain data: CSS variables for the board, the page and
// the two ball styles. Logic never reads them.

export const THEMES = {
  terracotta: {
    name: 'Terracotta',
    vars: {
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

export function applyTheme(id, root = document.documentElement) {
  const theme = THEMES[id] || THEMES.terracotta;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', theme.vars['--bg']);
}
