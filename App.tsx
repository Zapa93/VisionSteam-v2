import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { Category, Channel, PlaylistData } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO } from './constants';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  
  // Pagination State
  const [visibleGroupsCount, setVisibleGroupsCount] = useState(2);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load Playlist
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setPlaylist([]);
      const url = activeCategory === Category.KANALER ? ENTERTAINMENT_URL : SPORT_URL;
      const data = await fetchPlaylist(url);
      setPlaylist(data);
      setLoading(false);
      setVisibleGroupsCount(3); // Start with 3 groups
    };
    loadData();
  }, [activeCategory]);

  // Flatten for Player
  const allChannels = useMemo(() => {
    return playlist.flatMap(group => group.channels);
  }, [playlist]);

  // Infinite Scroll for Groups
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
           setVisibleGroupsCount((prev) => prev + 3);
        }
      },
      { rootMargin: '600px' }
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [playlist]);

  const displayedGroups = playlist.slice(0, visibleGroupsCount);

  // Stable callback to prevent VideoPlayer effect cleanup on re-render (channel switch)
  const handleClosePlayer = useCallback(() => {
    setSelectedChannel(null);
  }, []);

  // --- TV NAVIGATION: INITIAL FOCUS ---
  // Start app with focus on the Sidebar (Kanaler)
  useEffect(() => {
    if (!loading && !selectedChannel) {
      setTimeout(() => {
        // Only auto-focus if nothing else has focus (avoids stealing focus if user is quick)
        const current = document.activeElement;
        if (current && (current.tagName === 'BUTTON' || current.tagName === 'INPUT')) return;

        const sidebarBtn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
        if (sidebarBtn) sidebarBtn.focus();
      }, 100);
    }
  }, [loading]);

  // --- TV NAVIGATION: MANUAL D-PAD HANDLER ---
  useEffect(() => {
    if (selectedChannel) return; // Disable when player is open

    const handleKeyNav = (e: KeyboardEvent) => {
      // Focus Rescue: If focus is lost (on body), any key restores it to sidebar
      if ((document.activeElement === document.body || !document.activeElement) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Back'].includes(e.key)) {
         e.preventDefault();
         const sidebarBtn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
         if (sidebarBtn) {
           sidebarBtn.focus();
         } else {
           // Fallback to first channel if sidebar is somehow missing
           const firstChannel = document.querySelector('[data-channel-item]') as HTMLElement;
           if (firstChannel) firstChannel.focus();
         }
         return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const current = document.activeElement as HTMLElement;
        
        // --- SIDEBAR NAVIGATION ---
        if (current.hasAttribute('data-sidebar-item')) {
           if (e.key === 'ArrowRight') {
             e.preventDefault();
             const firstChannel = document.querySelector('[data-channel-item]') as HTMLElement;
             if (firstChannel) {
               firstChannel.focus();
             }
             return;
           }
           
           if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
             e.preventDefault();
             const buttons = Array.from(document.querySelectorAll('[data-sidebar-item]')) as HTMLElement[];
             const idx = buttons.indexOf(current);
             if (e.key === 'ArrowDown' && idx < buttons.length - 1) buttons[idx + 1].focus();
             if (e.key === 'ArrowUp' && idx > 0) buttons[idx - 1].focus();
             return;
           }
        }

        // --- CHANNEL LIST NAVIGATION ---
        if (current.hasAttribute('data-channel-item')) {
          e.preventDefault();
          
          if (e.key === 'ArrowLeft') {
             const sidebarBtn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
             if (sidebarBtn) sidebarBtn.focus();
             return;
          }

          const allButtons = Array.from(document.querySelectorAll('[data-channel-item]')) as HTMLElement[];
          const index = allButtons.indexOf(current);
          
          if (e.key === 'ArrowDown') {
            const next = allButtons[index + 1];
            if (next) {
              next.focus();
              next.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else if (e.key === 'ArrowUp') {
            const prev = allButtons[index - 1];
            if (prev) {
              prev.focus();
              prev.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [selectedChannel, activeCategory]);

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar 
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
      />

      <div className="flex-1 flex flex-col h-full relative z-0">
        <header className="h-20 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] z-20 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{activeCategory}</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {loading ? 'Loading...' : `${allChannels.length} channels`}
            </p>
          </div>
        </header>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth content-visibility-auto gpu-accelerated focus:outline-none"
        >
          {loading ? (
             <div className="flex flex-col gap-3">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-14 w-full bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : playlist.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <p>No channels found</p>
             </div>
          ) : (
            <div className="space-y-8 pb-20">
              {displayedGroups.map((group) => (
                <div key={group.title}>
                  {group.title.toLowerCase() !== 'uncategorized' && (
                    <div className="sticky top-0 z-10 bg-[#050505]/95 backdrop-blur-sm py-3 mb-2 flex items-center border-b border-white/5">
                      <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">{group.title}</h3>
                      <span className="ml-2 text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{group.channels.length}</span>
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2">
                    {group.channels.map((channel) => (
                      <button
                        key={channel.id}
                        data-channel-item
                        onClick={() => setSelectedChannel(channel)}
                        className="group relative w-full flex items-center gap-4 p-2.5 bg-[#111] rounded-lg border border-white/5 
                                   hover:bg-white/10 hover:border-white/10 hover:z-10
                                   focus:bg-white/5 focus:border-white focus:border-2 focus:z-20
                                   outline-none"
                      >
                         <div className="w-10 h-8 bg-black/40 rounded flex items-center justify-center p-0.5 shrink-0 group-focus:bg-white/20">
                            <img 
                              src={channel.logo} 
                              alt={channel.name}
                              className="max-w-full max-h-full object-contain"
                              loading="lazy"
                              onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO}
                            />
                         </div>

                         <div className="flex-1 text-left min-w-0">
                            <p className="text-gray-200 font-medium text-sm truncate group-focus:text-white group-hover:text-white">
                              {channel.name}
                            </p>
                         </div>
                         
                         {/* Hover/Focus Indicator */}
                         <div className="opacity-0 group-focus:opacity-100 group-hover:opacity-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                         </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              
              {displayedGroups.length < playlist.length && (
                <div ref={loadMoreRef} className="h-10 w-full" />
              )}
            </div>
          )}
        </div>
      </div>

      {selectedChannel && (
        <VideoPlayer 
          channel={selectedChannel} 
          allChannels={allChannels}
          onChannelSelect={setSelectedChannel}
          onClose={handleClosePlayer} 
        />
      )}
    </div>
  );
};

export default App;