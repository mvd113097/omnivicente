import React from 'react';
import { Compass, Sparkles, Shield, Quote } from 'lucide-react';

export const PracticeEthos: React.FC = () => {
  const principles = [
    {
      index: '01',
      title: 'Atmospheric Daylight as Primary Material',
      desc: 'Before drawing a perimeter, we study the solar azimuth throughout the four seasons. Deep lightwells, textured stone reveals, and circadian apertures ensure interior stillness that shifts harmoniously from dawn to dusk without relying on harsh artificial illumination.',
    },
    {
      index: '02',
      title: 'Radical Material Honesty & Patina',
      desc: 'We construct exclusively with mineral and organic substances that gain nobility as they age: hand-quarried limestone, PEFC-certified alpine timber, unlacquered bronze, and breathable lime plaster. We reject synthetic veneers that degrade into landfill.',
    },
    {
      index: '03',
      title: 'Centennial Vernacular Resilience',
      desc: 'A structure must withstand seismic, thermal, and generational shifts for at least two hundred years. By partnering with generational master stonemasons and joiners, we integrate vernacular knowledge with modern post-tensioned structural engineering.',
    },
  ];

  const credentials = [
    {
      metric: '38',
      unit: 'Works',
      label: 'Built Across 9 Countries',
      context: 'Completed private sanctuaries & cultural projects since 2014',
    },
    {
      metric: '94%',
      unit: '',
      label: 'Circular & Natural Materials',
      context: 'Measured life-cycle analysis across all residential commissions',
    },
    {
      metric: '14',
      unit: 'Honors',
      label: 'International Architectural Laurels',
      context: 'Including AIA International Cultural Award and Mies Americas nomination',
    },
    {
      metric: '100%',
      unit: '',
      label: 'Passive or Net-Zero Envelopes',
      context: 'Geothermal or biophilic cooling systems with zero fossil combustion',
    },
  ];

  const endorsements = [
    {
      quote:
        'Atelier Lumen creates spaces that do not compete with landscape but rather deepen our somatic connection to rock, water, and passing clouds.',
      author: 'Elena Rostova',
      role: 'Senior Architectural Editor',
      source: 'Domus International Review',
      year: '2025',
    },
    {
      quote:
        'Living in Villa Solaria transformed our family rhythm. In the midday heat, the thermal limestone creates an effortless cool silence that feels sacred.',
      author: 'Marcus & Clara Vane',
      role: 'Patrons & Residents',
      source: 'Villa Solaria Commission · Mallorca',
      year: '2025',
    },
  ];

  return (
    <section id="practice" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto w-full">
      {/* Section Header */}
      <div className="max-w-3xl mb-16">
        <span className="text-xs uppercase tracking-[0.2em] text-[#C28A4A] mb-3 block font-medium">
          Ethos & Methodology
        </span>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#F3EFE6] tracking-tight mb-6">
          Architecture as an Instrument of Quietude
        </h2>
        <p className="text-base sm:text-lg text-[#A1A1AA] font-light leading-relaxed">
          Founded in Copenhagen and Zürich, Atelier Lumen operates at the intersection of Scandinavian reduction and Japanese spatial clarity.
        </p>
      </div>

      {/* Editorial Numbered Principles (Natural numbering, no code comments) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {principles.map((p) => (
          <div
            key={p.index}
            className="p-8 bg-[#14161B] border border-white/5 rounded-sm hover:border-white/15 transition-colors flex flex-col justify-between"
          >
            <div>
              <span className="text-sm font-mono text-[#C28A4A] block mb-4">
                {p.index}.
              </span>
              <h3 className="text-xl font-serif text-[#F3EFE6] mb-3">
                {p.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#A1A1AA] font-light leading-relaxed">
                {p.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Quantitative Practice Credentials with Tabular Numerals */}
      <div className="mb-20 p-8 sm:p-10 bg-[#16181F] border border-white/10 rounded-sm">
        <div className="max-w-2xl mb-8">
          <span className="text-xs uppercase tracking-widest text-[#A1A1AA] block mb-1">
            Studio Benchmark
          </span>
          <h3 className="text-2xl font-serif text-[#F3EFE6]">
            Measurable Craft & Environmental Performance
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
          {credentials.map((c, i) => (
            <div key={i} className={`pt-4 sm:pt-0 ${i !== 0 ? 'sm:pl-6' : ''}`}>
              <div className="flex items-baseline gap-1 text-3xl sm:text-4xl font-serif text-[#F3EFE6] font-mono tabular-nums mb-1">
                <span>{c.metric}</span>
                {c.unit && <span className="text-lg font-sans text-[#C28A4A]">{c.unit}</span>}
              </div>
              <div className="text-xs font-semibold text-[#D4D2CD] mb-1">
                {c.label}
              </div>
              <p className="text-[11px] text-[#71717A] leading-normal font-light">
                {c.context}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Attributable Testimonials / Critical Review */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {endorsements.map((item, idx) => (
          <div
            key={idx}
            className="p-8 bg-[#14161B] border-l-2 border-[#C28A4A] rounded-r-sm space-y-4 flex flex-col justify-between"
          >
            <div>
              <Quote className="w-6 h-6 text-[#C28A4A]/50 mb-3" />
              <blockquote className="text-base sm:text-lg font-serif italic text-[#E8E6E1] leading-relaxed">
                "{item.quote}"
              </blockquote>
            </div>

            <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-[#F3EFE6] block">
                  {item.author}
                </span>
                <span className="text-[#A1A1AA]">
                  {item.role} · {item.source}
                </span>
              </div>
              <span className="font-mono tabular-nums text-[#71717A]">
                {item.year}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
