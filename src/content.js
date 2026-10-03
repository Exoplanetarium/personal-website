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
      "Hi! This is where I live (metaphorically). Write a few sentences about who you are, where you're from, and what you care about.",
    items: [
      {
        title: 'Currently',
        meta: '2026',
        text: 'What you are studying, building, or practicing right now.',
      },
      {
        title: 'Things I love',
        text: 'Late-night practice sessions, elegant algorithms, and good coffee.',
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
      {
        title: 'Spring Recital',
        meta: '2025 · Solo',
        text: 'Chopin – Ballade No. 1 in G minor. Replace this with your own program notes.',
        links: [{ label: 'Watch', href: '#' }],
      },
      {
        title: 'Piano Competition',
        meta: '2024 · 1st place',
        text: 'A short description of the competition and what you played.',
      },
      {
        title: 'Original Compositions',
        meta: 'Ongoing',
        text: 'Pieces you have written or arranged.',
        links: [{ label: 'Listen', href: '#' }],
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
        text: 'A procedurally generated low-poly planet where every island is a part of my life.',
        links: [{ label: 'Source', href: 'https://github.com/Exoplanetarium/personal-website' }],
      },
      {
        title: 'Project Two',
        meta: 'Python · ML',
        text: 'What it does, why you built it, and what you learned.',
        links: [{ label: 'GitHub', href: '#' }],
      },
      {
        title: 'Project Three',
        meta: 'C++',
        text: 'Another project worth showing off.',
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
