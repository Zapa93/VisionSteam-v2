import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { Category, Channel, PlaylistData } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO } from './constants';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  
  // Pagination State
  const [visibleGroupsCount, setVisibleGroupsCount] = useState(2);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // --- GLOBAL BACK BUTTON HANDLER ---
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 461 is WebOS Back Button
      if (e.key === 'Back' || e.keyCode === 461 || e.key === 'Escape') {
        if (selectedChannel) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedChannel(null); // Close player
        } 
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedChannel]);

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

  // Filter
  const filteredPlaylist = useMemo(() => {
    if (!searchQuery) return playlist;
    const lowerQuery = searchQuery.toLowerCase();
    
    return playlist.map(group => ({
      ...group,
      channels: group.channels.filter(ch => ch.name.toLowerCase().includes(lowerQuery))
    })).filter(group => group.channels.length > 0);
  }, [playlist, searchQuery]);

  // Flatten for Player
  const allChannels = useMemo(() => {
    return filteredPlaylist.flatMap(group => group.channels);
  }, [filteredPlaylist]);

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
  }, [filteredPlaylist]);

  const displayedGroups = filteredPlaylist.slice(0, visibleGroupsCount);

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

          <div className="relative group w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-colors"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth content-visibility-auto gpu-accelerated">
          {loading ? (
             <div className="flex flex-col gap-3">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-14 w-full bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredPlaylist.length === 0 ? (
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
                        onClick={() => setSelectedChannel(channel)}
                        className="group relative w-full flex items-center gap-4 p-2.5 bg-[#111] rounded-lg border border-white/5 
                                   hover:bg-white/10 hover:border-white/10 hover:z-10
                                   focus:bg-purple-600 focus:border-purple-400 focus:scale-[1.01] focus:shadow-lg focus:z-10
                                   transition-all duration-150 outline-none"
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
                            <p className="text-gray-200 font-medium text-sm truncate group-focus:text-white group-hover:text-white transition-colors">
                              {channel.name}
                            </p>
                         </div>
                         
                         {/* Hover/Focus Indicator */}
                         <div className="opacity-0 group-focus:opacity-100 group-hover:opacity-100 transition-opacity">
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
              
              {displayedGroups.length < filteredPlaylist.length && (
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
          onClose={() => setSelectedChannel(null)} 
        />
      )}
    </div>
  );
};

export default App;