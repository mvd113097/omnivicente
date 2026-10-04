import React from 'react';
import { X, Award, ArrowRight, Compass, ShieldCheck } from 'lucide-react';
import { Project } from '../data/projects';

interface ProjectDetailModalProps {
  project: Project | null;
  onClose: () => void;
  onInquireProject: (project: Project) => void;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  project,
  onClose,
  onInquireProject,
}) => {
  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#14161A] border border-white/10 rounded-sm shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0E0F11]">
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
            <span>{project.categoryLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{project.year}</span>
            <span aria-hidden="true">·</span>
            <span>{project.location}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#A1A1AA] hover:text-white hover:bg-white/10 rounded-sm transition-colors"
            aria-label="Close project modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-8">
          {/* Main Visual Asset with Fallback */}
          <div className="relative aspect-[16/9] w-full bg-[#1C1F26] rounded-sm overflow-hidden border border-white/10">
            <img
              src={project.image}
              alt={project.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-[#0E0F11]/85 backdrop-blur-sm px-3 py-1.5 border border-white/10 text-xs font-mono tabular-nums text-[#D4D2CD]">
              {project.areaSqm} m² · Build Timeline: {project.timeline}
            </div>
          </div>

          {/* Title & Editorial Overview */}
          <div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#F3EFE6] tracking-tight mb-2">
              {project.title}
            </h2>
            <p className="text-base text-[#C28A4A] font-light mb-4">
              {project.subtitle}
            </p>
            <p className="text-sm sm:text-base text-[#D4D2CD] leading-relaxed">
              {project.concept}
            </p>
          </div>

          {/* Award recognition if applicable */}
          {project.awards && (
            <div className="flex items-start gap-3 p-4 bg-[#1B1D22] border-l-2 border-[#C28A4A] rounded-r-sm">
              <Award className="w-5 h-5 text-[#C28A4A] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs uppercase tracking-wider text-[#A1A1AA] block mb-0.5">
                  Peer Recognition & Honors
                </span>
                <span className="text-sm font-medium text-[#F3EFE6]">
                  {project.awards}
                </span>
              </div>
            </div>
          )}

          {/* Material Palette Grid */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-[#A1A1AA] mb-3 flex items-center gap-2">
              <Compass className="w-3.5 h-3.5 text-[#C28A4A]" />
              Authentic Materiality Palette
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {project.materials.map((mat, i) => (
                <div
                  key={i}
                  className="p-3 bg-[#1A1D23] border border-white/5 rounded-sm"
                >
                  <span className="text-xs text-[#A1A1AA] font-mono block mb-1">
                    0{i + 1}
                  </span>
                  <span className="text-xs font-medium text-[#E8E6E1]">
                    {mat}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Architectural Technical Specifications */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-[#A1A1AA] mb-3 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C28A4A]" />
              Engineering & Performance Metrics
            </h3>
            <div className="divide-y divide-white/5 border border-white/10 rounded-sm overflow-hidden bg-[#181B20]">
              {project.specifications.map((spec, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 text-xs">
                  <span className="text-[#A1A1AA] font-medium sm:w-1/3 mb-1 sm:mb-0">
                    {spec.label}
                  </span>
                  <span className="text-[#F3EFE6] sm:w-2/3 sm:text-right">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-white/10 bg-[#0E0F11]">
          <div className="text-xs text-[#A1A1AA]">
            Commissioning inquiries for similar typologies are reviewed quarterly.
          </div>
          <button
            onClick={() => {
              onClose();
              onInquireProject(project);
            }}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-colors rounded-sm flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span>Commission Similar Project</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
