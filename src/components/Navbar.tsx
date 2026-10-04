import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  onOpenInquiry: (initialData?: { typology?: string; scale?: number }) => void;
  onNavigate: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenInquiry, onNavigate }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { label: 'Selected Works', id: 'works' },
    { label: 'Practice & Ethos', id: 'practice' },
    { label: 'Spatial Configurator', id: 'configurator' },
    { label: 'Monograph', id: 'monograph' },
    { label: 'Studio Coordinates', id: 'coordinates' },
  ];

  const handleLinkClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    onNavigate(id);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0E0F11]/90 backdrop-blur-md border-b border-white/10 py-3.5 shadow-2xl'
          : 'bg-gradient-to-b from-[#0E0F11]/80 to-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => handleLinkClick(e, 'top')}
          className="text-xl md:text-2xl font-serif tracking-widest text-[#F3EFE6] hover:text-[#C28A4A] transition-colors whitespace-nowrap"
        >
          ATELIER LUMEN
        </a>

        {/* Zone 2: 4-5 clean text nav links */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#A1A1AA]">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleLinkClick(e, item.id)}
              className="hover:text-[#F3EFE6] transition-colors relative py-1 group whitespace-nowrap"
            >
              {item.label}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#C28A4A] transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onOpenInquiry()}
            className="px-5 py-2.5 text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-all duration-200 rounded-sm whitespace-nowrap shadow-sm active:scale-95"
          >
            Commission Studio
          </button>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-[#A1A1AA] hover:text-white transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0E0F11] border-b border-white/10 px-6 py-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleLinkClick(e, item.id)}
              className="block text-base font-serif text-[#E8E6E1] hover:text-[#C28A4A] py-1 border-b border-white/5"
            >
              {item.label}
            </a>
          ))}
          <div className="pt-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenInquiry();
              }}
              className="w-full py-3 text-center text-xs font-semibold tracking-wider uppercase text-[#0E0F11] bg-[#F3EFE6] hover:bg-[#C28A4A] hover:text-white transition-colors rounded-sm"
            >
              Commission Studio
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
