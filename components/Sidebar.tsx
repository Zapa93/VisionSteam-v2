
import React, { useEffect, useState, useRef } from 'react';
import { Category } from '../types';
import { fetchFootballHighlights, HighlightMatch, getBroadcastersForMatch } from '../services/geminiService';

interface SidebarProps {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
  allChannels: import('../types').Channel[]; // Type needed for potential future use or keeping prop contract
}

export const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onSelectCategory }) => {
  const [highlights, setHighlights] = useState<HighlightMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Broadcaster Search State
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [broadcasters, setBroadcasters] = useState<string[]>([]);
  
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadHighlights = async () => {
      setLoading(true);
      const matches = await fetchFootballHighlights();
      setHighlights(matches.slice(0, 8)); // Show top 8
      setLoading(false);
    };
    loadHighlights();
  }, []);

  const handleInteractionStart = (matchId: string, matchTitle: string) => {
    // Clear any pending timer
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    // If we are already showing this match, do nothing
    if (activeMatchId === matchId) return;

    // Start a 5-second timer
    searchTimerRef.current = setTimeout(async () => {
      setActiveMatchId(matchId);
      setIsSearching(true);
      setBroadcasters([]); // Clear previous results
      
      const channels = await getBroadcastersForMatch(matchTitle);
      setBroadcasters(channels);
      setIsSearching(false);
    }, 5000);
  };

  const handleInteractionEnd = () => {
    // Only cancel the pending timer. Do NOT close the drawer immediately.
    // This allows the drawer to stay open while the user looks at it or moves the mouse.
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  };

  const handleSidebarLeave = () => {
    // Close the drawer when the mouse leaves the entire sidebar area (including the drawer itself)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setActiveMatchId(null);
  };

  return (
    <div 
      onMouseLeave={handleSidebarLeave}
      className="w-96 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col pt-10 relative z-50"
    >
      <nav className="shrink-0 px-4 space-y-4 relative z-10">
        {Object.values(Category).map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              data-sidebar-item={category}
              onClick={() => onSelectCategory(category)}
              className={`w-full group relative flex items-center px-4 py-4 rounded-xl transition-all duration-200 
                ${isActive 
                  ? 'bg-white/10' 
                  : 'hover:bg-white/5'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-purple-500 rounded-r-full"></div>
              )}
              
              <div className={`mr-4 p-2 rounded-lg transition-colors ${isActive ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400'}`}>
                {category === Category.KANALER ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>

              <span className={`text-lg font-medium tracking-wide ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {category}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 flex flex-col justify-end px-4 pb-6 mt-4 overflow-hidden relative z-10">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Highlights</h3>
        
        {loading ? (
           <div className="space-y-2">
             <div className="h-12 bg-white/5 rounded-lg animate-pulse"></div>
             <div className="h-12 bg-white/5 rounded-lg animate-pulse"></div>
             <div className="h-12 bg-white/5 rounded-lg animate-pulse"></div>
           </div>
        ) : highlights.length > 0 ? (
          <div className="space-y-2.5 overflow-y-auto no-scrollbar pb-2 relative">
            {highlights.map(match => (
              <div 
                key={match.id} 
                data-highlight-id={match.id}
                tabIndex={-1} // Allow programmatic focus
                onMouseEnter={() => handleInteractionStart(match.id, match.match)}
                onMouseLeave={handleInteractionEnd}
                onFocus={() => handleInteractionStart(match.id, match.match)}
                onBlur={handleInteractionEnd}
                className="bg-white/5 rounded-lg p-3 border border-white/5 hover:bg-white/10 focus:bg-white/10 focus:border-white/30 outline-none transition-colors cursor-pointer group"
              >
                <div className="flex justify-between items-baseline mb-1 pointer-events-none">
                   <span className="text-[11px] text-purple-400 font-bold uppercase truncate">{match.league}</span>
                   <span className="text-[11px] text-gray-400 shrink-0 ml-2 group-hover:text-gray-200 group-focus:text-gray-200 transition-colors">
                     {match.time.split(' ').pop()?.replace(/CET|CEST/, '') || match.time}
                   </span>
                </div>
                <div className="text-sm font-semibold text-gray-100 leading-tight pointer-events-none">{match.match}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-600 italic px-1">No major matches found for today.</div>
        )}
      </div>

      {/* SEARCH RESULT DRAWER */}
      {/* Absolute positioned to the right of the sidebar */}
      <div 
        className={`absolute top-0 bottom-0 left-full w-72 bg-black/95 backdrop-blur-xl border-l border-r border-white/10 shadow-2xl transition-all duration-300 z-[100] flex flex-col pointer-events-auto
          ${activeMatchId ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0 pointer-events-none'}`}
      >
        <div className="p-4 border-b border-white/10 bg-white/5">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Broadcasters</h4>
          <p className="text-[10px] text-gray-400 mt-1">Found via Web Search</p>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">
          {isSearching ? (
             <div className="flex flex-col items-center justify-center h-40 space-y-3">
               <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-xs text-purple-400 animate-pulse">Finding channels...</span>
             </div>
          ) : broadcasters.length > 0 ? (
             <ul className="space-y-2">
               {broadcasters.map((b, i) => (
                 <li key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-white/5 p-2 rounded border border-white/5">
                    <svg className="w-3 h-3 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>{b}</span>
                 </li>
               ))}
             </ul>
          ) : (
             <div className="text-xs text-gray-500 italic text-center mt-10">No specific broadcaster info found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
