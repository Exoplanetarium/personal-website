// ─────────────────────────────────────────────────────────────
//  Everything you'd want to edit lives here.
//
//  Each section becomes an island on the globe.
//    lat / lon – where the island sits (degrees). Keep islands ~70°+ apart.
//    size      – rough island radius in radians (0.35 small … 0.6 large)
//    theme     – look & props, see themes.js ('village' | 'music' | 'code' | 'summit')
//    place     – the fictional place name shown above the title
// ─────────────────────────────────────────────────────────────

export const profile = {
  name: 'David Hadi',
  tagline: 'Developer · Pianist · A Third Thing',
  links: [
    { label: 'GitHub', href: 'https://github.com/Exoplanetarium' },
    { label: 'Email', href: 'mailto:drhu.contact@gmail.com' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/davidhadi/' },
  ],
};

export const sections = [
  {
    id: 'about',
    title: 'About Me',
    place: 'Bag End',
    theme: 'village',
    lat: 18,
    lon: 8,
    size: 0.5,
    intro:
      "Hi! Welcome to my life. Take a look around and explore the identities that make up who I am.",
    items: [
      {
        title: 'Things I love',
        text: `* Practicing in a room with great acoustics and listening to the sound echoing off the walls.
               * Having intellectual conversations with my friends.
               * Kombucha`,
      },
      {
        title: 'Currently',
        meta: '2026',
        text: 'Research in automatic music transcription.',
        links: [{ label: 'Learn More', href: 'https://github.com/Exoplanetarium/LiveScore' }],
      },
    ],
  },
  {
    id: 'music',
    title: 'Music',
    place: 'Yu Jia Wang is the best pianist imo',
    theme: 'music',
    lat: 38,
    lon: 100,
    size: 0.46,
    intro: 'Piano has been part of my life for years. Here are some performances and pieces I am proud of.',
    items: [
      // `marker: 'obelisk'` gives this stop a stone obelisk; `pieces` lists your repertoire.
      // recording: an audio file in public/recordings/ plays right on the page
      //            (e.g. 'recordings/ballade-1.mp3'); any other URL (YouTube…) becomes a link.
      {
        title: 'Repertoire',
        meta: 'Pieces I enjoyed playing',
        text: 'Solo Pieces',
        marker: 'obelisk',
        pieces: [
          { title: 'Piano Concerto No. 1 in F# minor, Op. 1, Mvt 1: Vivace - Moderato', composer: 'Rachmaninoff', year: 2027 },
          { title: 'Estampes', composer: 'Debussy', year: 2026 },
          { title: 'Prelude in B minor, Op. 32 Nos. 10 & 12', composer: 'Rachmaninoff', year: 2026 },
          { title: 'Piano Sonata No. 17 in D minor (The Tempest), Mvt 1: Largo - Allegro', composer: 'Beethoven', year: 2026, recording: 'https://drive.google.com/file/d/17gLjY9iMLmyYY_9LpG-tgAaYBjpnSuAF/view?usp=sharing' },
          { title: 'Ballade No. 1 in G minor, Op. 23', composer: 'Chopin', year: 2025, recording: 'https://drive.google.com/file/d/1C57iUMpcMu8bBhJPZDcVHW0RG2SYZPqK/view?usp=sharing' },
          { title: 'Etude Op. 25 No. 12 (Winter Wind)', composer: 'Chopin', year: 2024, recording: 'https://drive.google.com/file/d/1ZUKCb0eY8Byl2rsjc0GdLEu75EywDzXW/view?usp=sharing' },
        ],
      },
      {
        title: 'Repertoire',
        meta: 'Pieces I enjoyed playing',
        text: 'Chamber Pieces',
        marker: 'obelisk',
        pieces: [
          { title: 'Tambourin Chinois', composer: 'Kreisler (arr. Greg Anderson)', year: 2026, recording: 'https://drive.google.com/file/d/171xU_zY6XxCc0mifpXCesDW-wFa-2rs9/view?usp=sharing' },
          { title: 'Capriccio Stravagante', composer: 'Farina', year: 2026, recording: 'https://drive.google.com/file/d/1Am5QkGUiX_v5Zvpk7p0_GVkzXIvXuSQM/view?usp=sharing' },
          { title: 'Piano Quartet in G minor, K. 478', composer: 'Mozart', year: 2025, recording: 'https://drive.google.com/file/d/16voscvU3OU1Brg0vGQ7YUVWoDSI5KVug/view?usp=sharing' },
        ],
      },
      {
        title: 'Piano Competition',
        meta: '2026 · Honorable Mention',
        text: 'Beethoven Sonata Competition, performed Movement 1 of The Tempest (see solo pieces)',
      },
    ],
  },
  {
    id: 'cs',
    title: 'Computer Science',
    place: 'Silicon Valley',
    theme: 'code',
    lat: -24,
    lon: -98,
    size: 0.5,
    intro: 'Projects, experiments, and things I have built.',
    items: [
      {
        title: 'This Website',
        meta: 'Three.js · Vite',
        text: 'A planet-style personal website cataloging my achievements and interests. Easter eggs included.',
        links: [{ label: 'Source', href: 'https://github.com/Exoplanetarium/personal-website' }],
      },
      {
        title: 'Decompute',
        meta: 'ReactJS',
        text: 'Decentralized computing platform to help combat the use of financially and environmentally expensive data centers.',
        links: [{ label: 'Source', href: 'https://github.com/Exoplanetarium/Decompute' }],
      },
      {
        title: 'Todo Webapp',
        meta: 'ReactJS',
        text: 'Simple modern todo webapp that connects to my school\'s services and calendars. Built initially for myself but later shared with others.',
        links: [{ label: 'Source', href: 'https://github.com/Exoplanetarium/todolist' }],
      },
      {
        title: 'Crystal',
        meta: 'ReactJS · AI',
        text: 'AI-powered Chrome extension that helps make corporate sustainability reports easy to understand.',
        links: [{ label: 'Source', href: 'https://github.com/Exoplanetarium/Crystal' }],
      },
    ],
  },
  {
    id: 'achievements',
    title: 'Achievements',
    place: 'El Capitan',
    theme: 'summit',
    lat: -12,
    lon: 172,
    size: 0.48,
    intro: 'Awards, honors, and milestones along the climb.',
    items: [
      { title: 'Award Name', meta: '2025', text: 'What it was for.' },
      { title: 'Competition Result', meta: '2024', text: 'A sentence of context.' },
      { title: 'Scholarship / Honor', meta: '2023', text: 'A sentence of context.' },
    ],
  },
];
