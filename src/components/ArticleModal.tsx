import React from 'react';
import { X, Clock, Calendar, BookOpen } from 'lucide-react';
import { Article } from '../data/monograph';

interface ArticleModalProps {
  article: Article | null;
  onClose: () => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({ article, onClose }) => {
  if (!article) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#14161A] border border-white/10 rounded-sm shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0E0F11]">
          <div className="flex items-center gap-3 text-xs text-[#A1A1AA]">
            <span>{article.category}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <Clock className="w-3 h-3 text-[#C28A4A]" /> {article.readTime}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#C28A4A]" /> {article.date}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#A1A1AA] hover:text-white hover:bg-white/10 rounded-sm transition-colors"
            aria-label="Close article modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Article Body */}
        <div className="overflow-y-auto p-6 sm:p-10 space-y-6">
          <div className="border-b border-white/10 pb-6">
            <span className="text-xs uppercase tracking-widest text-[#C28A4A] block mb-2 font-medium">
              Atelier Lumen Monograph Note
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif text-[#F3EFE6] leading-tight">
              {article.title}
            </h1>
          </div>

          <div className="space-y-5 text-sm sm:text-base text-[#D4D2CD] leading-relaxed font-light">
            {article.content.map((paragraph, idx) => (
              <p key={idx} className={idx === 0 ? 'text-base sm:text-lg text-[#E8E6E1] leading-relaxed' : ''}>
                {paragraph}
              </p>
            ))}
          </div>

          {/* Author Signature & Colophon */}
          <div className="mt-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-[#71717A]">
            <span>Published by Atelier Lumen Editorial Archive</span>
            <span className="font-serif italic text-[#A1A1AA]">Copenhagen & Zürich</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-[#0E0F11] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs uppercase tracking-wider text-[#A1A1AA] hover:text-white transition-colors"
          >
            Close Monograph
          </button>
        </div>
      </div>
    </div>
  );
};
