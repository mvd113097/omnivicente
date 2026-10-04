import React, { useState } from 'react';
import { ArrowDown, Sun, Sunset, Moon, Sparkles } from 'lucide-react';

interface HeroProps {
  onExploreWorks: () => void;
  onOpenConfigurator: () => void;
  onViewProject: (projectId: string) => void;
}

export const Hero: React.FC<HeroProps> = ({
  onExploreWorks,
  onOpenConfigurator,
  onViewProject,
}) => {
  // Atmospheric lighting state simulation: 'daylight' | 'golden' | 'twilight'
  const [lightingMode, setLightingMode] = useState<'daylight' | 'golden' | 'twilight'>('golden');

  const lightingStyles = {
    daylight: 'brightness-105 contrast-95',
    golden: 'brightness-100 contrast-105 sepia-[0.15] hue-rotate-[-10deg]',
    twilight: 'brightness-85 contrast-115 hue-rotate-[15deg] saturate-90',
  };

  return (
    <section id="top" className="relative min-h-screen flex flex-col justify-between pt-28 pb-12 px-6 lg:px-12 overflow-hidden bg-[#0A0B0D]">
      {/* Background Architectural Media with measured contrast scrim */}
      <div className="absolute inset-0 z-0">
        <img
          src="/src/assets/images/hero_architectural_residence_1791107237646.jpg"
          alt="Residence Bellevue cantilevered glass and raw concrete residence by Atelier Lumen"
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover object-center transition-all duration-700 ease-out scale-[1.02] ${lightingStyles[lightingMode]}`}
        />
        {/* Measured Scrim: dark gradient ensuring 4.5:1 text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E0F11] via-[#0E0F11]/60 to-[#0E0F11]/40" />
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#0E0F11]/30 to-[#0E0F11]/80" />
      </div>

      {/* Top Hero Bar: Unboxed Studio Coordinates & Atmospheric Lighting Switcher */}
      <div className="relative z-10 max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-b border-white/10 pb-4">
        {/* Unboxed metadata with typographic separators */}
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#D4D2CD]">
          <span>Copenhagen</span>
          <span aria-hidden="true" className="text-[#C28A4A]">·</span>
          <span>Zürich</span>
          <span aria-hidden="true" className="text-[#C28A4A]">·</span>
          <span>Kyoto</span>
          <span aria-hidden="true" className="text-[#C28A4A]">·</span>
          <span>Est. 2014</span>
        </div>

        {/* Ambient Daylight Calibration (Interactive atmospheric state) */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-[#A1A1AA] hidden md:inline">
            Solar Calibration
          </span>
          <div className="flex items-center bg-[#181A1F]/80 backdrop-blur-sm border border-white/10 p-0.5 rounded-sm">
            <button
              onClick={() => setLightingMode('daylight')}
              title="Daylight illumination"
              className={`px-2.5 py-1 text-xs flex items-center gap-1.5 transition-colors rounded-sm ${
                lightingMode === 'daylight'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Midday</span>
            </button>
            <button
              onClick={() => setLightingMode('golden')}
              title="Golden hour solar grazing"
              className={`px-2.5 py-1 text-xs flex items-center gap-1.5 transition-colors rounded-sm ${
                lightingMode === 'golden'
                  ? 'bg-[#C28A4A]/30 text-[#F3EFE6] shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Sunset className="w-3.5 h-3.5 text-[#E6A052]" />
              <span className="hidden sm:inline">Golden Hour</span>
            </button>
            <button
              onClick={() => setLightingMode('twilight')}
              title="Twilight atmospheric quiet"
              className={`px-2.5 py-1 text-xs flex items-center gap-1.5 transition-colors rounded-sm ${
                lightingMode === 'twilight'
                  ? 'bg-indigo-950/60 text-indigo-200 shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Twilight</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Primary Statement & Focal Anchor */}
      <div className="relative z-10 max-w-7xl mx-auto w-full my-auto py-12 lg:py-20">
        <div className="max-w-3xl">
          <span className="text-xs uppercase tracking-[0.25em] text-[#C28A4A] mb-4 block font-medium">
            Architectural & Spatial Atelier
          </span>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif text-[#F3EFE6] leading-[1.08] tracking-tight mb-6"
            style={{ textWrap: 'balance' }}
          >
            Architecture shaped by quietude, light, and enduring materiality.
          </h1>

          <p className="text-base sm:text-lg text-[#D4D2CD] leading-relaxed max-w-2xl mb-10 font-light">
            We compose private residential sanctuaries, contemplative cultural pavilions, and bespoke spaces designed to weather two centuries with dignity.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onExploreWorks}
              className="px-6 py-3.5 text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-all duration-200 rounded-sm shadow-md active:scale-95 whitespace-nowrap"
            >
              Explore Selected Works
            </button>
            <button
              onClick={onOpenConfigurator}
              className="px-6 py-3.5 text-xs font-semibold tracking-wider uppercase text-[#F3EFE6] bg-[#1E2025]/80 hover:bg-[#2A2D34] border border-white/15 transition-all duration-200 rounded-sm whitespace-nowrap active:scale-95 flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C28A4A]" />
              Launch Scope Configurator
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Hero Bar: Featured Landmark & Quick Scroll Prompt */}
      <div className="relative z-10 max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-end justify-between gap-6 pt-6 border-t border-white/10">
        {/* Landmark attribution card */}
        <div
          onClick={() => onViewProject('residence-atelier-lumen')}
          className="cursor-pointer group flex items-start gap-4 p-3 -ml-3 rounded-sm hover:bg-white/5 transition-colors"
        >
          <div className="w-12 h-12 bg-neutral-800 rounded-sm overflow-hidden shrink-0 border border-white/10">
            <img
              src="/src/assets/images/hero_architectural_residence_1791107237646.jpg"
              alt="Residence Bellevue thumbnail"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
              <span>Featured Landmark</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">820 m²</span>
            </div>
            <div className="text-sm font-medium text-[#F3EFE6] group-hover:text-[#C28A4A] transition-colors">
              Residence Bellevue · Lake Zurich, 2026 →
            </div>
          </div>
        </div>

        {/* Scroll affordance */}
        <button
          onClick={onExploreWorks}
          className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#A1A1AA] hover:text-[#F3EFE6] transition-colors group"
        >
          <span>Scroll to Discover</span>
          <ArrowDown className="w-3.5 h-3.5 text-[#C28A4A] group-hover:translate-y-1 transition-transform" />
        </button>
      </div>
    </section>
  );
};
