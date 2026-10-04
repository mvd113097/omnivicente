import React, { useState } from 'react';
import { Sliders, Download, ArrowRight, CheckCircle2, Clock, Trees, Sparkles } from 'lucide-react';

interface ConfiguratorState {
  typology: 'coastal' | 'mountain' | 'urban' | 'cultural';
  areaSqm: number;
  materiality: 'travertine' | 'timber' | 'cedar' | 'concrete';
  sustainability: 'passive' | 'carbon_negative' | 'thermal_mass';
}

interface SpatialConfiguratorProps {
  onApplyToInquiry: (summary: {
    typology: string;
    areaSqm: number;
    materiality: string;
    sustainability: string;
    estimatedMonths: number;
  }) => void;
}

export const SpatialConfigurator: React.FC<SpatialConfiguratorProps> = ({ onApplyToInquiry }) => {
  const [config, setConfig] = useState<ConfiguratorState>({
    typology: 'coastal',
    areaSqm: 500,
    materiality: 'travertine',
    sustainability: 'carbon_negative',
  });

  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Dynamic calculations based on parameters
  const getTimelineMonths = () => {
    let base = 14;
    if (config.typology === 'mountain') base += 4;
    if (config.typology === 'cultural') base += 6;
    if (config.typology === 'urban') base += 2;
    const areaFactor = Math.round((config.areaSqm - 200) / 150);
    return Math.max(12, base + areaFactor);
  };

  const getCarbonReduction = () => {
    if (config.sustainability === 'carbon_negative') return 52;
    if (config.sustainability === 'passive') return 44;
    return 36;
  };

  const typologyLabels: Record<ConfiguratorState['typology'], { title: string; desc: string }> = {
    coastal: {
      title: 'Coastal Sanctuary',
      desc: 'Saline air resistance, deep solar colonnades, open horizon apertures',
    },
    mountain: {
      title: 'Alpine / Forest Lodge',
      desc: 'High snow-load mass-timber, geothermal thermal storage, tree canopy sensitivity',
    },
    urban: {
      title: 'Urban Penthouse / Adaptive Reuse',
      desc: 'Acoustic decoupling, historic fabric integration, vertical garden voids',
    },
    cultural: {
      title: 'Cultural Pavilion & Gallery',
      desc: 'Acoustically calibrated volumes, indirect north daylighting, public circulation',
    },
  };

  const materialLabels: Record<ConfiguratorState['materiality'], { title: string; origin: string }> = {
    travertine: { title: 'Honed Travertine & Cast Bronze', origin: 'Mediterranean mineral quarry & sand-cast metals' },
    timber: { title: 'Mass Timber (CLT) & Swiss Basalt', origin: 'Sustainably harvested Alpine pine & volcanic stone' },
    cedar: { title: 'Charred Shou Sugi Ban & Granite', origin: 'Traditional flame-preserved timber & honed granite' },
    concrete: { title: 'Board-Formed White Concrete & Glass', origin: 'Low-clinker pozzolanic mix & structural triple-glazing' },
  };

  const sustainabilityLabels: Record<ConfiguratorState['sustainability'], { title: string; spec: string }> = {
    passive: { title: 'Passive House Standard', spec: 'Airtight envelope, triple-glazed thermal breaks, heat recovery' },
    carbon_negative: { title: 'Carbon-Negative Timber Structural Mass', spec: 'Biogenic carbon sequestration exceeding embodied footprint' },
    thermal_mass: { title: 'Micro-Climatic Thermal Mass', spec: 'Diurnal solar heat capture, zero mechanical cooling reliance' },
  };

  const months = getTimelineMonths();
  const carbonPct = getCarbonReduction();
  const areaSqFt = Math.round(config.areaSqm * 10.7639);

  const handleDownloadBrief = () => {
    const briefText = `================================================
ATELIER LUMEN | ARCHITECTURAL SCOPE SPECIFICATION
================================================
Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

1. PROJECT TYPOLOGY:
   ${typologyLabels[config.typology].title}
   Description: ${typologyLabels[config.typology].desc}

2. SPATIAL SCALE:
   Gross Internal Area: ${config.areaSqm} m² (${areaSqFt.toLocaleString()} sq ft)

3. MATERIALITY & CRAFTSMANSHIP:
   ${materialLabels[config.materiality].title}
   Origin: ${materialLabels[config.materiality].origin}

4. SUSTAINABILITY TARGET:
   ${sustainabilityLabels[config.sustainability].title}
   Performance: ${sustainabilityLabels[config.sustainability].spec}
   Embodied Carbon Reduction: -${carbonPct}% below benchmark

5. ESTIMATED DEVELOPMENT SCHEDULE:
   Total Project Horizon: ~${months} Months
   - Phase I: Site Hydrology & Solar Path Calibration (~3 mo)
   - Phase II: Schematic Architectural Massing (~4 mo)
   - Phase III: Detailed Joinery & Municipal Permitting (~5 mo)
   - Phase IV: Master Construction & Commissioning (~${Math.max(6, months - 12)} mo)

================================================
For formal consultation inquiries:
Atelier Lumen · Inquiries Desk
Copenhagen · Zürich · Kyoto
================================================
`;
    const blob = new Blob([briefText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Atelier_Lumen_Scope_Brief_${config.typology}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleProceedToInquiry = () => {
    onApplyToInquiry({
      typology: typologyLabels[config.typology].title,
      areaSqm: config.areaSqm,
      materiality: materialLabels[config.materiality].title,
      sustainability: sustainabilityLabels[config.sustainability].title,
      estimatedMonths: months,
    });
  };

  return (
    <section id="configurator" className="py-24 px-6 lg:px-12 bg-[#0C0D0F] border-t border-b border-white/10">
      <div className="max-w-7xl mx-auto w-full">
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <span className="text-xs uppercase tracking-[0.2em] text-[#C28A4A] mb-3 block font-medium">
            Spatial Feasibility Studio
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#F3EFE6] tracking-tight mb-4">
            Interactive Scope & Materiality Configurator
          </h2>
          <p className="text-sm sm:text-base text-[#A1A1AA] font-light leading-relaxed">
            Calibrate spatial volume, regional environmental parameters, and carbon performance to generate an exploratory architectural scope brief.
          </p>
        </div>

        {/* Two-Column Configurator Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Controls Column (7 Cols) */}
          <div className="lg:col-span-7 space-y-8 bg-[#14161B] p-6 sm:p-8 rounded-sm border border-white/10">
            {/* Step 1: Typology */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs uppercase tracking-widest text-[#F3EFE6] font-medium flex items-center gap-2">
                  <span className="text-[#C28A4A] font-mono">01.</span> Select Architectural Typology
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(typologyLabels) as Array<ConfiguratorState['typology']>).map((key) => {
                  const item = typologyLabels[key];
                  const isSelected = config.typology === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setConfig({ ...config, typology: key })}
                      className={`text-left p-4 rounded-sm border transition-all ${
                        isSelected
                          ? 'bg-[#1E2128] border-[#C28A4A] text-white'
                          : 'bg-[#181A20] border-white/5 text-[#A1A1AA] hover:border-white/15'
                      }`}
                    >
                      <div className="text-sm font-serif font-medium text-[#F3EFE6] mb-1">
                        {item.title}
                      </div>
                      <div className="text-xs text-[#71717A] line-clamp-2">
                        {item.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Floor Area Slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs uppercase tracking-widest text-[#F3EFE6] font-medium flex items-center gap-2">
                  <span className="text-[#C28A4A] font-mono">02.</span> Calibrate Spatial Scale
                </label>
                <div className="text-right">
                  <span className="text-base font-serif font-medium text-[#F3EFE6] font-mono tabular-nums">
                    {config.areaSqm} m²
                  </span>
                  <span className="text-xs text-[#71717A] ml-2 font-mono tabular-nums">
                    ({areaSqFt.toLocaleString()} sq ft)
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={150}
                max={1500}
                step={25}
                value={config.areaSqm}
                onChange={(e) => setConfig({ ...config, areaSqm: Number(e.target.value) })}
                className="w-full h-2 bg-[#22252C] rounded-lg appearance-none cursor-pointer accent-[#C28A4A]"
              />
              <div className="flex justify-between text-[11px] text-[#71717A] font-mono mt-2">
                <span>150 m² (Compact Sanctuary)</span>
                <span>750 m² (Private Villa)</span>
                <span>1,500 m² (Civic Masterwork)</span>
              </div>
            </div>

            {/* Step 3: Material Palette */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs uppercase tracking-widest text-[#F3EFE6] font-medium flex items-center gap-2">
                  <span className="text-[#C28A4A] font-mono">03.</span> Materiality & Tactility
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(materialLabels) as Array<ConfiguratorState['materiality']>).map((key) => {
                  const item = materialLabels[key];
                  const isSelected = config.materiality === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setConfig({ ...config, materiality: key })}
                      className={`text-left p-3.5 rounded-sm border transition-all ${
                        isSelected
                          ? 'bg-[#1E2128] border-[#C28A4A] text-white'
                          : 'bg-[#181A20] border-white/5 text-[#A1A1AA] hover:border-white/15'
                      }`}
                    >
                      <div className="text-xs font-medium text-[#F3EFE6] mb-0.5">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#71717A]">
                        {item.origin}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 4: Sustainability & Energy Strategy */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs uppercase tracking-widest text-[#F3EFE6] font-medium flex items-center gap-2">
                  <span className="text-[#C28A4A] font-mono">04.</span> Ecological & Carbon Benchmark
                </label>
              </div>
              <div className="space-y-2">
                {(Object.keys(sustainabilityLabels) as Array<ConfiguratorState['sustainability']>).map((key) => {
                  const item = sustainabilityLabels[key];
                  const isSelected = config.sustainability === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setConfig({ ...config, sustainability: key })}
                      className={`w-full text-left p-3 rounded-sm border transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'bg-[#1E2128] border-[#C28A4A] text-white'
                          : 'bg-[#181A20] border-white/5 text-[#A1A1AA] hover:border-white/15'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border mt-0.5 shrink-0 flex items-center justify-center ${
                        isSelected ? 'border-[#C28A4A] bg-[#C28A4A]' : 'border-white/20'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-[#F3EFE6]">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#71717A]">
                          {item.spec}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dynamic Synthesis Card (5 Cols) */}
          <div className="lg:col-span-5 bg-[#171920] border border-white/10 rounded-sm p-6 sm:p-8 space-y-6 lg:sticky lg:top-24">
            <div className="border-b border-white/10 pb-4">
              <span className="text-xs uppercase tracking-widest text-[#A1A1AA] block mb-1">
                Feasibility Synthesis
              </span>
              <h3 className="text-2xl font-serif text-[#F3EFE6]">
                Preliminary Scope Blueprint
              </h3>
            </div>

            {/* Calculated Key Metrics with Tabular Figures */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-[#1A1D24] border border-white/5 rounded-sm">
                <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA] mb-1">
                  <Clock className="w-3.5 h-3.5 text-[#C28A4A]" />
                  <span>Timeline Horizon</span>
                </div>
                <div className="text-2xl font-serif text-[#F3EFE6] font-mono tabular-nums">
                  ~{months} <span className="text-sm font-sans text-[#A1A1AA]">mo</span>
                </div>
                <div className="text-[11px] text-[#71717A] mt-1">
                  Permits through Handover
                </div>
              </div>

              <div className="p-4 bg-[#1A1D24] border border-white/5 rounded-sm">
                <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA] mb-1">
                  <Trees className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Carbon Offset</span>
                </div>
                <div className="text-2xl font-serif text-emerald-300 font-mono tabular-nums">
                  -{carbonPct}%
                </div>
                <div className="text-[11px] text-[#71717A] mt-1">
                  Vs. Concrete Baseline
                </div>
              </div>
            </div>

            {/* Live Scope Checklist */}
            <div className="space-y-3 text-xs border-t border-b border-white/10 py-4">
              <div className="flex justify-between py-1">
                <span className="text-[#A1A1AA]">Typology</span>
                <span className="text-[#F3EFE6] font-medium text-right">
                  {typologyLabels[config.typology].title}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#A1A1AA]">Spatial Scale</span>
                <span className="text-[#F3EFE6] font-mono tabular-nums text-right">
                  {config.areaSqm} m² ({areaSqFt.toLocaleString()} sq ft)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#A1A1AA]">Material System</span>
                <span className="text-[#F3EFE6] text-right truncate max-w-[200px]">
                  {materialLabels[config.materiality].title}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#A1A1AA]">Building Standard</span>
                <span className="text-[#F3EFE6] text-right truncate max-w-[200px]">
                  {sustainabilityLabels[config.sustainability].title}
                </span>
              </div>
            </div>

            {/* Actions: Proceed to Inquiry & Download */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleProceedToInquiry}
                className="w-full py-3.5 px-4 text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-all duration-200 rounded-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-md active:scale-95"
              >
                <span>Commission with this Scope</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleDownloadBrief}
                className="w-full py-3 px-4 text-xs font-medium text-[#D4D2CD] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm transition-colors flex items-center justify-center gap-2"
              >
                {downloadSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Brief Downloaded to Device</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Formal Scope Brief (.txt)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
