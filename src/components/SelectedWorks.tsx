import React, { useState } from 'react';
import { LayoutGrid, Table, ArrowUpRight, Compass } from 'lucide-react';
import { Project, PROJECTS } from '../data/projects';

interface SelectedWorksProps {
  onSelectProject: (project: Project) => void;
  onOpenConfigurator: () => void;
}

export const SelectedWorks: React.FC<SelectedWorksProps> = ({
  onSelectProject,
  onOpenConfigurator,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'residential' | 'cultural'>('all');
  const [viewMode, setViewMode] = useState<'bento' | 'table'>('bento');

  const filteredProjects = PROJECTS.filter((p) => {
    if (activeFilter === 'all') return true;
    return p.category === activeFilter;
  });

  return (
    <section id="works" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto w-full">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-white/10 pb-8">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[#C28A4A] mb-3 block font-medium">
            Architectural Archive
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#F3EFE6] tracking-tight">
            Selected Works & Spatial Studies
          </h2>
          <p className="text-sm sm:text-base text-[#A1A1AA] mt-3 max-w-xl font-light">
            Each commission responds to site hydrology, micro-climatic light, and geological strata.
          </p>
        </div>

        {/* View Switcher and Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Filter - Segmented Control */}
          <div className="flex items-center bg-[#181A1F] border border-white/10 p-1 rounded-sm">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                activeFilter === 'all'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              All Typologies
            </button>
            <button
              onClick={() => setActiveFilter('residential')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                activeFilter === 'residential'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Residential
            </button>
            <button
              onClick={() => setActiveFilter('cultural')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                activeFilter === 'cultural'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Cultural & Pavilions
            </button>
          </div>

          {/* Layout Mode Toggle */}
          <div className="flex items-center bg-[#181A1F] border border-white/10 p-1 rounded-sm">
            <button
              onClick={() => setViewMode('bento')}
              title="Editorial Bento View"
              className={`p-1.5 rounded-sm transition-colors ${
                viewMode === 'bento' ? 'bg-white/15 text-white' : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Technical Register View"
              className={`p-1.5 rounded-sm transition-colors ${
                viewMode === 'table' ? 'bg-white/15 text-white' : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Table className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bento Grid View */}
      {viewMode === 'bento' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          {filteredProjects.map((project, index) => {
            // Asymmetric Bento hierarchy
            const isWide = index === 0 || index === 3;
            const colSpan = isWide ? 'lg:col-span-7' : 'lg:col-span-5';

            return (
              <article
                key={project.id}
                onClick={() => onSelectProject(project)}
                className={`${colSpan} group cursor-pointer flex flex-col bg-[#14161B] border border-white/5 hover:border-white/20 transition-all duration-300 rounded-sm overflow-hidden`}
              >
                {/* Image Frame with Aspect Ratio */}
                <div className="relative aspect-[16/10] overflow-hidden bg-[#1A1D24]">
                  <img
                    src={project.image}
                    alt={project.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#14161B] via-transparent to-transparent opacity-60" />
                  
                  {/* Subtle hover icon affordance */}
                  <div className="absolute top-4 right-4 w-9 h-9 bg-[#0E0F11]/80 backdrop-blur-sm border border-white/15 rounded-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-4 h-4 text-[#C28A4A]" />
                  </div>
                </div>

                {/* Content details without pill badges */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Clean unboxed metadata with typographic separators */}
                    <div className="flex items-center gap-2 text-xs text-[#A1A1AA] mb-2 font-light">
                      <span>{project.categoryLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{project.year}</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.location}</span>
                    </div>

                    <h3 className="text-2xl font-serif text-[#F3EFE6] group-hover:text-[#C28A4A] transition-colors mb-2">
                      {project.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed line-clamp-2 mb-4">
                      {project.excerpt}
                    </p>
                  </div>

                  {/* Materials line */}
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-[#71717A] truncate max-w-[70%]">
                      {project.materials.slice(0, 2).join(' · ')}
                    </span>
                    <span className="font-mono tabular-nums text-[#D4D2CD] shrink-0">
                      {project.areaSqm} m²
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Technical Register / Table View with Tabular Figures */
        <div className="border border-white/10 rounded-sm overflow-x-auto bg-[#14161B]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#181A20] border-b border-white/10 text-[#A1A1AA] uppercase tracking-wider font-mono">
              <tr>
                <th className="py-3.5 px-6">Project Title</th>
                <th className="py-3.5 px-6">Typology</th>
                <th className="py-3.5 px-6">Location</th>
                <th className="py-3.5 px-6 font-mono text-right">Floor Area</th>
                <th className="py-3.5 px-6 font-mono text-right">Completed</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="hover:bg-white/5 cursor-pointer transition-colors group"
                >
                  <td className="py-4 px-6 font-serif text-base text-[#F3EFE6] group-hover:text-[#C28A4A] transition-colors whitespace-nowrap">
                    {project.title}
                  </td>
                  <td className="py-4 px-6 text-[#A1A1AA] whitespace-nowrap">
                    {project.categoryLabel}
                  </td>
                  <td className="py-4 px-6 text-[#A1A1AA] whitespace-nowrap">
                    {project.location}
                  </td>
                  <td className="py-4 px-6 font-mono tabular-nums text-[#D4D2CD] text-right whitespace-nowrap">
                    {project.areaSqm} m²
                  </td>
                  <td className="py-4 px-6 font-mono tabular-nums text-[#A1A1AA] text-right whitespace-nowrap">
                    {project.year}
                  </td>
                  <td className="py-4 px-6 text-right whitespace-nowrap">
                    <span className="text-[#C28A4A] group-hover:underline inline-flex items-center gap-1">
                      Case Study <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Scope Configurator invitation teaser */}
      <div className="mt-16 p-8 bg-[#181A20] border border-white/10 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs uppercase tracking-wider text-[#C28A4A] font-medium block mb-1">
            Tailored Architectural Commissions
          </span>
          <h3 className="text-xl font-serif text-[#F3EFE6]">
            Have an atypical plot, conservation heritage site, or private retreat in mind?
          </h3>
          <p className="text-sm text-[#A1A1AA] mt-1 max-w-xl font-light">
            Use our interactive Spatial Scope Configurator to test architectural typology, area, timber sustainability parameters, and development phases.
          </p>
        </div>
        <button
          onClick={onOpenConfigurator}
          className="px-6 py-3 text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-colors rounded-sm whitespace-nowrap self-start md:self-auto shrink-0 flex items-center gap-2"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Launch Spatial Configurator</span>
        </button>
      </div>
    </section>
  );
};
