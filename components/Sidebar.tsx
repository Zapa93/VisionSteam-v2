
import React, { useEffect, useState, useRef } from 'react';
import { Category, EPGData, Channel } from '../types';
import { fetchFootballHighlights, HighlightMatch, getBroadcastersForMatch } from '../services/geminiService';
import { DEFAULT_LOGO } from '../constants';

interface SidebarProps {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
  allChannels: Channel[];
  epgData: EPGData;
  onChannelSelect: (channel: Channel) => void;
}

interface LocalMatchChannel {
    channel: Channel;
    programTitle: string;
    isLive: boolean;
    start: Date;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onSelectCategory, allChannels, epgData, onChannelSelect }) => {
  const [highlights, setHighlights] = useState<HighlightMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Search State
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Results
  const [broadcasters, setBroadcasters] = useState<string[]>([]);
  const [localMatches, setLocalMatches] = useState<LocalMatchChannel[]>([]);
  
  useEffect(() => {
    const loadHighlights = async () => {
      setLoading(true);
      const matches = await fetchFootballHighlights();
      setHighlights(matches.slice(0, 8)); // Show top 8
      setLoading(false);
    };
    loadHighlights();
  }, []);

  const findLocalMatches = (matchTitle: string) => {
     if (!allChannels || !epgData) return [];

     // Normalize and split teams
     // Example: "Inter Milan vs Como" -> ["inter milan", "como"]
     const terms = matchTitle.toLowerCase()
        .replace(/\s(vs|v|VS|V)\s/g, '|')
        .split('|')
        .map(t => t.trim());
     
     if (terms.length < 2) return [];

     const results: LocalMatchChannel[] = [];
     const MAX_RESULTS = 20;

     // Helper: Does the EPG text contain the team name?
     const isFuzzyMatch = (text: string, team: string) => {
         const cleanText = text.toLowerCase();
         // 1. Direct match
         if (cleanText.includes(team)) return true;
         
         // 2. Token match (e.g. "Inter" match "Inter Milan")
         // We check if *significant* words from the team name are in the text
         const teamWords = team.split(' ').filter(w => w.length > 2 && !['fc', 'afc', 'united', 'city', 'real'].includes(w));
         if (teamWords.length > 0) {
             // If any unique identifier word is present (e.g. "Barcelona" in "FC Barcelona")
             if (teamWords.some(w => cleanText.includes(w))) return true;
         }

         // 3. Common Abbreviation Handling (Basic)
         if (team.includes('manchester') && (cleanText.includes('man ') || cleanText.includes('man.'))) return true;
         if (team.includes('saint-germain') && cleanText.includes('psg')) return true;

         return false;
     };

     for (const channel of allChannels) {
        if (results.length >= MAX_RESULTS) break;
        if (!channel.tvgId || !epgData[channel.tvgId]) continue;

        const programs = epgData[channel.tvgId];
        const now = new Date();
        const futureLimit = new Date(now.getTime() + 12 * 60 * 60 * 1000); // Look 12h ahead

        const relevantProgram = programs.find(p => {
             if (p.end < now || p.start > futureLimit) return false;
             
             // Check title AND description
             const textToCheck = (p.title + " " + p.description).toLowerCase();
             
             const match0 = isFuzzyMatch(textToCheck, terms[0]);
             const match1 = isFuzzyMatch(textToCheck, terms[1]);
             
             return match0 && match1;
        });

        if (relevantProgram) {
            results.push({
                channel,
                programTitle: relevantProgram.title,
                isLive: now >= relevantProgram.start && now < relevantProgram.end,
                start: relevantProgram.start
            });
        }
     }
     
     // Sort live matches first
     return results.sort((a, b) => (a.isLive === b.isLive ? 0 : a.isLive ? -1 : 1));
  };

  const handleMatchClick = async (matchId: string, matchTitle: string) => {
    if (activeMatchId === matchId && (broadcasters.length > 0 || localMatches.length > 0)) return;

    setActiveMatchId(matchId);
    setIsSearching(true);
    setBroadcasters([]); 
    setLocalMatches([]);
    
    // 1. Local EPG Search (Fast)
    const local = findLocalMatches(matchTitle);
    setLocalMatches(local);

    // 2. Web Search (Async)
    const channels = await getBroadcastersForMatch(matchTitle);
    setBroadcasters(channels);
    
    setIsSearching(false);
  };

  const handleSidebarLeave = () => {
    setActiveMatchId(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent focus loss when clicking empty areas of the sidebar
    // We only allow focus change if the target is explicitly interactive
    const target = e.target as HTMLElement;
    // Check for buttons, highlights, or the drawer items which are interactive
    const isInteractive = 
        target.closest('button') || 
        target.closest('[data-highlight-id]') ||
        target.closest('.cursor-pointer');

    if (!isInteractive) {
        e.preventDefault();
    }
  };

  return (
    <div 
      onMouseLeave={handleSidebarLeave}
      onMouseDown={handleMouseDown}
      className="w-96 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col pt-10 relative z-50"
    >
      <nav className="shrink-0 px-4 space-y-4 relative z-20">
        {Object.values(Category).map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              data-sidebar-item={category}
              onClick={() => onSelectCategory(category)}
              className={`w-full group relative flex items-center px-4 py-4 rounded-xl 
                ${isActive 
                  ? 'bg-white/10' 
                  : 'hover:bg-white/5'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-purple-500 rounded-r-full"></div>
              )}
              
              <div className={`mr-4 p-2 rounded-lg ${isActive ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400'}`}>
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
             <div className="h-12 bg-white/5 rounded-lg opacity-50"></div>
             <div className="h-12 bg-white/5 rounded-lg opacity-50"></div>
             <div className="h-12 bg-white/5 rounded-lg opacity-50"></div>
           </div>
        ) : highlights.length > 0 ? (
          <div className="space-y-2.5 overflow-y-auto no-scrollbar pb-2 relative">
            {highlights.map(match => (
              <div 
                key={match.id} 
                data-highlight-id={match.id}
                tabIndex={-1} 
                onClick={() => handleMatchClick(match.id, match.match)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMatchClick(match.id, match.match);
                }}
                className="bg-white/5 rounded-lg p-3 border border-white/5 hover:bg-white/10 focus:bg-white/10 focus:border-white/30 outline-none cursor-pointer group"
              >
                <div className="flex justify-between items-baseline mb-1 pointer-events-none">
                   <span className="text-xs font-bold text-purple-400 uppercase truncate max-w-[180px]">{match.league}</span>
                   <span className="text-[11px] text-gray-400 shrink-0 ml-2 group-hover:text-gray-200 group-focus:text-gray-200">
                     {match.time.split(' ').pop()?.replace(/CET|CEST/, '') || match.time}
                   </span>
                </div>
                <div className="text-2xl font-bold text-gray-100 leading-tight pointer-events-none mt-1">{match.match}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-600 italic px-1">No major matches found for today.</div>
        )}
      </div>

      {/* SEARCH RESULT DRAWER */}
      <div 
        className={`absolute top-0 bottom-0 left-full w-[450px] bg-[#111] border-l border-r border-white/10 shadow-2xl z-[100] flex flex-col pointer-events-auto transition-transform duration-300 hidden
          ${activeMatchId ? '!flex translate-x-0 opacity-100 visible' : '-translate-x-4 opacity-0 invisible pointer-events-none'}`}
      >
        <div className="p-6 border-b border-white/10 bg-white/5">
          <h4 className="text-xl font-bold text-white uppercase tracking-wider">Where to Watch</h4>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto no-scrollbar flex flex-col">
          {/* SECTION 1: LOCAL CHANNELS */}
          <div className="mb-6">
              <h5 className="text-sm font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Watch Now (Your Channels)
              </h5>
              
              {localMatches.length > 0 ? (
                <div className="space-y-2">
                   {localMatches.map((lm, i) => (
                      <div 
                        key={i} 
                        onClick={() => onChannelSelect(lm.channel)}
                        className="group flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer active:scale-95 transition-transform"
                      >
                         <div className="h-12 w-20 bg-gray-300 flex items-center justify-center rounded p-1 shrink-0 border border-white/10">
                            <img src={lm.channel.logo} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
                         </div>
                         <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-2">
                                <p className="text-white font-bold truncate group-hover:text-purple-400">{lm.channel.name}</p>
                                {lm.isLive && <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">LIVE</span>}
                             </div>
                             <p className="text-xs text-gray-400 truncate">{lm.programTitle}</p>
                         </div>
                         <div className="shrink-0 bg-white/10 p-2 rounded-full group-hover:bg-purple-600 group-hover:text-white">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                         </div>
                      </div>
                   ))}
                </div>
              ) : (
                <div className="p-4 bg-white/5 rounded-lg border border-white/5 text-center">
                    <p className="text-xs text-gray-500 italic">No matching channels found in your playlist.</p>
                </div>
              )}
          </div>

          {/* VISUAL DIVIDER */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6 shrink-0"></div>

          {/* SECTION 2: WEB BROADCASTERS */}
          <div>
              <h5 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  Global Web Info
              </h5>
              
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-20 space-y-3">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-purple-400">Scanning web info...</span>
                </div>
              ) : broadcasters.length > 0 ? (
                <ul className="space-y-2">
                  {broadcasters.map((b, i) => (
                    <li key={i} className="flex items-center gap-3 text-lg text-gray-300 bg-white/5 p-3 rounded-lg border border-white/5">
                        <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="font-medium">{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-600 italic">No global broadcaster info found.</div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
