export interface Article {
  id: string;
  title: string;
  category: string;
  readTime: string;
  date: string;
  excerpt: string;
  content: string[];
}

export const MONOGRAPH_ARTICLES: Article[] = [
  {
    id: 'choreography-of-daylight',
    title: 'The Choreography of Daylight: Why We Shape Space Around Solar Paths',
    category: 'Spatial Theory',
    readTime: '6 min read',
    date: 'February 2026',
    excerpt: 'Light is not merely illumination; it is the primary building material that defines volume, texture, and the psychological cadence of dwelling.',
    content: [
      'In contemporary architecture, daylight is frequently treated as an afterthought—a mechanical calculation of lux levels satisfied by standard rectangular openings. At Atelier Lumen, we invert this hierarchy: before a single wall is placed, we model the sun’s exact angle across all four seasons.',
      'A room should breathe with the circadian shift. Morning light ought to possess crisp, cool clarity in culinary and bathing spaces, while evening light should graze textured lime plaster with warm, contemplative grazing angles.',
      'By sculpting deep reveals, angled lightwells, and perforated louvers, we create interiors that remain dynamic without kinetic machinery. The shadow cast by an oak mullion at 3:15 PM becomes as intentional as the furniture upon which it falls.'
    ]
  },
  {
    id: 'mass-timber-silence',
    title: 'Mass Timber and Acoustic Mass: Redefining Quiet Luxury in Dense Landscapes',
    category: 'Material Research',
    readTime: '8 min read',
    date: 'January 2026',
    excerpt: 'True luxury in the modern metropolis is acoustic silence. How cross-laminated timber dampens cognitive overload through organic resonance.',
    content: [
      'The modern city generates a relentless hum of high-frequency environmental friction: traffic vibration, mechanical air handlers, and reflective hard surfaces that compound auditory exhaustion.',
      'Unlike hollow drywall partitions that act as acoustic drums, solid mass-timber elements possess intrinsic internal damping. The cellulose cellular structure of Scots pine absorbs high frequencies while grounding low-frequency resonances.',
      'When timber is combined with dense basalt hearth stones and natural wool insulations, an interior achieves a tactile stillness reminiscent of a subterranean cathedral—instantly slowing the human pulse upon crossing the threshold.'
    ]
  },
  {
    id: 'building-for-centuries',
    title: 'Vernacular Resilience: The Discipline of Building for Two Hundred Years',
    category: 'Practice & Ethos',
    readTime: '5 min read',
    date: 'November 2025',
    excerpt: 'Why ephemeral architectural trends degrade both landscapes and balance sheets, and how mineral permanence preserves generational legacy.',
    content: [
      'We reject the disposable commercial cycles that define much of modern speculative construction. A building should improve with age, accumulating a dignified patina rather than requiring catastrophic renovation after fifteen years.',
      'To build for two centuries demands strict material discipline: local stone that resists saline winds, unlacquered bronze that deepens in character through touch, and joinery that accommodates natural thermal movement without petrochemical sealants.',
      'When we design a residence or pavilion, we consider how future generations will encounter the wear on its threshold stone. Permanence is the ultimate environmental and cultural sustainability.'
    ]
  }
];
