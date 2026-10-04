export interface Project {
  id: string;
  title: string;
  subtitle: string;
  category: 'residential' | 'cultural' | 'hospitality' | 'spatial';
  categoryLabel: string;
  year: string;
  location: string;
  areaSqm: number;
  timeline: string;
  image: string;
  materials: string[];
  excerpt: string;
  concept: string;
  awards?: string;
  specifications: {
    label: string;
    value: string;
  }[];
}

export const PROJECTS: Project[] = [
  {
    id: 'solaria-cliff-residence',
    title: 'Villa Solaria',
    subtitle: 'Limestone promontory residence overlooking the Balearic Sea',
    category: 'residential',
    categoryLabel: 'Residential Sanctuary',
    year: '2025',
    location: 'Mallorca, Spain',
    areaSqm: 680,
    timeline: '24 Months',
    image: '/src/assets/images/project_coastal_villa_1791107256080.jpg',
    materials: ['Honed Santanyí Limestone', 'Bleached White Oak', 'Hand-hammered Bronze', 'Hydraulic Lime Plaster'],
    excerpt: 'Carved directly into coastal strata, Villa Solaria dissolves boundaries between living terraces and maritime horizons.',
    concept: 'Oriented along the maritime solar trajectory, the villa employs thermal mass and deep colonnades to maintain natural coolness through Mediterranean summers without mechanical reliance. The monolithic limestone walls reference traditional dry-stone agrarian terraces.',
    awards: 'International Architecture Award 2025 · Best Private Residence',
    specifications: [
      { label: 'Structural System', value: 'Local Santanyí limestone masonry & low-carbon concrete' },
      { label: 'Thermal Envelope', value: 'Triple-glazed low-iron solar control glass' },
      { label: 'Energy Performance', value: 'Passive solar cooling & 18kW concealed photovoltaic array' },
      { label: 'Water Ecology', value: '45,000L subterranean rainwater cistern with biological filter' }
    ]
  },
  {
    id: 'kyoto-tea-pavilion',
    title: 'The Kyoto Water Pavilion',
    subtitle: 'Contemplative pavilion and tea room within an ancient cedar grove',
    category: 'cultural',
    categoryLabel: 'Cultural Pavilion',
    year: '2024',
    location: 'Kyoto, Japan',
    areaSqm: 240,
    timeline: '16 Months',
    image: '/src/assets/images/project_kyoto_pavilion_1791107272381.jpg',
    materials: ['Charred Shou Sugi Ban Cedar', 'Kurama Stone', 'Washi Paper Screens', 'Darkened Gunmetal'],
    excerpt: 'An exercise in sensory calibration, balancing darkness and soft diffused morning light across stepping-stone reflections.',
    concept: 'Built in collaboration with generational Sukiya-daiku timber craftsmen, the pavilion balances traditional Japanese joinery with contemporary seismic isolation engineering. Acoustically isolated water basins flank the tea platform.',
    awards: 'AIA International Honor Award for Cultural Architecture',
    specifications: [
      { label: 'Joinery System', value: 'Kigumi interlocked Japanese cedar without mechanical fasteners' },
      { label: 'Acoustics', value: 'Micro-perforated blackened timber acoustic baffle system' },
      { label: 'Landscape', value: 'Historical moss restoration and native bamboo bio-swale' },
      { label: 'Lighting', value: 'Concealed 2200K circadian warm grazing fixtures' }
    ]
  },
  {
    id: 'nordic-forest-sanctuary',
    title: 'Nordmarka Forest Lodge',
    subtitle: 'Mass-timber sanctuary nestled within the boreal canopy',
    category: 'residential',
    categoryLabel: 'Residential Sanctuary',
    year: '2025',
    location: 'Oslo, Norway',
    areaSqm: 420,
    timeline: '18 Months',
    image: '/src/assets/images/project_scandinavian_retreat_1791107287356.jpg',
    materials: ['Cross-Laminated Timber (CLT)', 'Norwegian Black Pine', 'Honed Basalt', 'Raw Brass'],
    excerpt: 'Elevated on delicate steel footings to preserve fragile root networks, this retreat hovers above the pine forest floor.',
    concept: 'Conceived as an off-grid ecological sanctuary, the lodge relies on pre-fabricated mass-timber modules transported via electric winter sleds to eliminate heavy machinery site disruption. A central hearth acts as thermal battery.',
    awards: 'Nordic Timber Architecture Prize 2025 Nominee',
    specifications: [
      { label: 'Structural Timber', value: '100% PEFC certified local Scots pine cross-laminated timber' },
      { label: 'Foundation', value: 'Eight point-load steel micro-piles (zero ground excavation)' },
      { label: 'Heating', value: 'Closed-loop geothermal boreholes + masonry soapstone stove' },
      { label: 'Carbon Balance', value: 'Net-negative (-142 tonnes CO2 stored in timber structure)' }
    ]
  },
  {
    id: 'residence-atelier-lumen',
    title: 'Residence Bellevue',
    subtitle: 'Cantilevered glass and board-formed concrete lakeside residence',
    category: 'residential',
    categoryLabel: 'Residential Sanctuary',
    year: '2026',
    location: 'Lake Zurich, Switzerland',
    areaSqm: 820,
    timeline: '28 Months',
    image: '/src/assets/images/hero_architectural_residence_1791107237646.jpg',
    materials: ['Board-formed White Concrete', 'Thermal Fluted Glass', 'European Walnut', 'Brushed Stainless Steel'],
    excerpt: 'A study in gravitational weight and transparency, with 14-meter cantilevered terraces framing alpine waters.',
    concept: 'Constructed along a steep glacial moraine, Residence Bellevue frames views toward the Glarus Alps through triple-height structural glass portals. Thermal mass regulates interior comfort against seasonal alpine swings.',
    awards: 'Swiss Architecture Award 2026 Shortlist',
    specifications: [
      { label: 'Structural Feat', value: 'Post-tensioned 14-meter reinforced concrete cantilever' },
      { label: 'Glazing', value: 'Triple-layer insulated structural glass panels (4.8m height)' },
      { label: 'Ventilation', value: 'Decentralized heat recovery system with 92% thermal efficiency' },
      { label: 'Automation', value: 'Integrated KNX environmental shading and circadian lighting' }
    ]
  }
];
