// Visual themes for islands. Each section in content.js picks one by name.
//
//   style   – terrain shape: 'hills' | 'terraces' | 'mesas' | 'peaks'
//   kit     – which props/landmark get built (see props.js)
//   palette – sand: beaches, bands: low → high elevation, cliff: steep faces,
//             foliage: tree colors, accent: beacon / UI highlight

export const themes = {
  village: {
    style: 'hills',
    kit: 'village',
    palette: {
      sand: '#f6d98e',
      bands: ['#9ad96a', '#6cc45a', '#43a25a', '#2f8a63', '#4d7f4a', '#c79a6b'],
      cliff: '#b9805a',
      foliage: ['#3fa34d', '#2d8a5f', '#7fcf4f', '#f29e4c', '#e8574a'],
      accent: '#ffb347',
    },
  },
  music: {
    style: 'terraces',
    kit: 'music',
    palette: {
      sand: '#ffe3ef',
      // alternating bands make the terraces read like stacked piano keys
      bands: ['#ff9ec7', '#c77dff', '#ff9ec7', '#c77dff', '#8c6bff', '#fff0f7'],
      cliff: '#6b3fa0',
      foliage: ['#ff6fae', '#b15cff', '#ffd1e8', '#ff8f6b'],
      accent: '#ff5fa2',
    },
  },
  code: {
    style: 'mesas',
    kit: 'code',
    palette: {
      sand: '#dff6ff',
      bands: ['#3fe0c5', '#2bb5d9', '#3a7bd5', '#3a7bd5', '#2d4fa8', '#a6fff2'],
      cliff: '#22407e',
      foliage: ['#3be8b0', '#1fb5a8', '#7cf7ff'],
      accent: '#22e4ff',
    },
  },
  summit: {
    style: 'peaks',
    kit: 'summit',
    palette: {
      sand: '#ffe9a8',
      bands: ['#f6c453', '#e8a33d', '#d1733b', '#a8503a', '#8a4a5a', '#f5f0ff', '#ffffff'],
      cliff: '#7a3f30',
      foliage: ['#e05d3a', '#f2a541', '#2f7d5b', '#3c9a6b'],
      accent: '#ffd23f',
    },
  },
};

// Unlabeled little islands scattered across the ocean.
export const wildTheme = {
  style: 'wild',
  kit: null,
  palette: {
    sand: '#f7e3b0',
    bands: ['#a5dc7c', '#74c46a', '#4fa86a'],
    cliff: '#a87b5a',
    foliage: ['#3fa34d', '#7fcf4f', '#2d8a5f'],
    accent: '#ffffff',
  },
};

export const water = {
  ocean: '#27b0d0',
  shallow: '#8ff0dc',
  deep: '#15326e',
};
