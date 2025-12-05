
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { fetchEPG, getCurrentProgram } from './services/epgService';
import { Category, Channel, PlaylistData, EPGData } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO } from './constants';

// --- CONSTANTS FOR VIRTUALIZATION ---
const CHANNEL_HEIGHT = 90; // px
const HEADER_HEIGHT = 50; // px

interface FlatItem {
  type: 'header' | 'channel';
  id: string;
  top: number;
  height: number;
  data?: Channel;
  title?: string;
  index: number; 
  channelNumber?: number;
}

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  
  // EPG State
  const [epgData, setEpgData] = useState<EPGData>({});
  
  // --- VIRTUAL LIST STATE ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  // --- FOCUS STATE ---
  const [activeSection, setActiveSection] = useState<'sidebar' | 'list'>('sidebar');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Load Playlist & EPG
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setPlaylist([]);
      setEpgData({});
      
      const url = activeCategory === Category.KANALER ? ENTERTAINMENT_URL : SPORT_URL;
      const { groups, epgUrl } = await fetchPlaylist(url);
      setPlaylist(groups);
      setLoading(false);
      
      // Reset focus
      setActiveSection('sidebar');
      setFocusedIndex(-1);

      // Fetch EPG if URL is present
      if (epgUrl) {
          console.log("Found EPG URL:", epgUrl);
          fetchEPG(epgUrl).then(data => setEpgData(data));
      }
    };
    loadData();
  }, [activeCategory]);

  // --- DATA FLATTENING ---
  const { items: flatItems, totalHeight } = useMemo(() => {
    const items: FlatItem[] = [];
    let currentTop = 0;
    let channelCounter = 1;
    
    playlist.forEach(group => {
      if (group.channels.length === 0) return;
      const isUncategorized = group.title.toLowerCase() === 'uncategorized';
      
      if (!isUncategorized) {
         items.push({
           type: 'header',
           id: `hdr-${group.title}`,
           title: group.title,
           top: currentTop,
           height: HEADER_HEIGHT,
           index: items.length
         });
         currentTop += HEADER_HEIGHT;
      }
      
      group.channels.forEach(channel => {
        items.push({
          type: 'channel',
          id: channel.id,
          data: channel,
          top: currentTop,
          height: CHANNEL_HEIGHT,
          index: items.length,
          channelNumber: channelCounter++
        });
        currentTop += CHANNEL_HEIGHT;
      });
    });
    
    return { items, totalHeight: currentTop };
  }, [playlist]);

  // --- MEASURE CONTAINER ---
  useEffect(() => {
    if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight);
    const handleResize = () => { if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop);

  // --- SCROLL TO FOCUS ---
  useEffect(() => {
    if (activeSection === 'list' && focusedIndex !== -1 && scrollRef.current) {
      const item = flatItems[focusedIndex];
      if (item) {
        const currentScroll = scrollRef.current.scrollTop;
        const viewH = scrollRef.current.clientHeight;
        // Logic modified to avoid fighting mouse scroll if item is already visible
        // Only scroll if strictly out of bounds
        if (item.top < currentScroll) {
            scrollRef.current.scrollTo({ top: item.top, behavior: 'auto' });
        } else if (item.top + item.height > currentScroll + viewH) {
            scrollRef.current.scrollTo({ top: item.top + item.height - viewH, behavior: 'auto' });
        }
      }
    }
  }, [focusedIndex, activeSection, flatItems]);

  // --- KEYBOARD NAVIGATION ENGINE ---
  useEffect(() => {
    if (selectedChannel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      // Focus Rescue
      if (!document.activeElement || document.activeElement === document.body) {
         const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
         btn?.focus();
      }

      const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'PageUp', 'PageDown'].includes(e.key);
      if (!isNav) return;

      if (activeSection === 'sidebar') {
        if (e.key === 'ArrowRight') {
           e.preventDefault();
           setActiveSection('list');
           if (focusedIndex === -1) {
              const firstChannelIdx = flatItems.findIndex(i => i.type === 'channel');
              setFocusedIndex(firstChannelIdx !== -1 ? firstChannelIdx : 0);
           }
           (document.activeElement as HTMLElement)?.blur();
           return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const categories = Object.values(Category);
            let idx = categories.indexOf(activeCategory);
            if (e.key === 'ArrowDown') idx++;
            if (e.key === 'ArrowUp') idx--;
            if (idx < 0) idx = 0;
            if (idx >= categories.length) idx = categories.length - 1;
            const targetCat = categories[idx];
            const btn = document.querySelector(`[data-sidebar-item="${targetCat}"]`) as HTMLElement;
            btn?.focus();
        }
        if (e.key === 'Enter') {
            const currentVal = document.activeElement?.getAttribute('data-sidebar-item');
            if (currentVal && currentVal !== activeCategory) {
               e.preventDefault();
               setActiveCategory(currentVal as Category);
            }
        }
      } else {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
           setActiveSection('sidebar');
           setTimeout(() => {
              const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
              btn?.focus();
           }, 0);
           return;
        }
        if (e.key === 'Enter') {
            const item = flatItems[focusedIndex];
            if (item && item.type === 'channel' && item.data) {
                setSelectedChannel(item.data);
            }
            return;
        }

        let nextIndex = focusedIndex;
        if (e.key === 'ArrowUp') nextIndex--;
        else if (e.key === 'ArrowDown') nextIndex++;
        else if (e.key === 'PageUp') nextIndex += 5;
        else if (e.key === 'PageDown') nextIndex -= 5;

        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;
        if (flatItems[nextIndex].type === 'header') {
            if (nextIndex > focusedIndex) nextIndex++; else nextIndex--;
        }
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;

        setFocusedIndex(nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, focusedIndex, flatItems, loading, selectedChannel, activeCategory]);

  // --- RENDER HELPERS ---
  const renderVirtualItems = () => {
    if (loading || flatItems.length === 0) return null;

    let startIndex = 0;
    let low = 0, high = flatItems.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (flatItems[mid].top + flatItems[mid].height < scrollTop - 100) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    startIndex = Math.max(0, low);
    
    let endIndex = startIndex;
    for (let i = startIndex; i < flatItems.length; i++) {
        if (flatItems[i].top > scrollTop + containerHeight + 100) break;
        endIndex = i;
    }

    return flatItems.slice(startIndex, endIndex + 1).map((item) => {
        if (item.type === 'header') {
            return (
                <div
                    key={item.id}
                    style={{ position: 'absolute', top: item.top, left: 0, right: 0, height: item.height }}
                    className="flex items-center px-6 bg-[#050505] border-b border-white/5 z-0"
                >
                    <span className="text-purple-400 text-sm font-bold uppercase tracking-wider">{item.title}</span>
                </div>
            );
        }

        const isFocused = activeSection === 'list' && focusedIndex === item.index;
        
        // EPG Info
        const currentProg = item.data?.tvgId ? getCurrentProgram(epgData[item.data.tvgId]) : null;
        let itemProgress = 0;
        if (currentProg) {
            const t = currentProg.end.getTime() - currentProg.start.getTime();
            const e = new Date().getTime() - currentProg.start.getTime();
            itemProgress = Math.min(100, Math.max(0, (e / t) * 100));
        }

        return (
            <div
                key={item.id}
                onMouseEnter={() => {
                  setFocusedIndex(item.index);
                  setActiveSection('list');
                }}
                onClick={() => {
                    setFocusedIndex(item.index);
                    setActiveSection('list');
                    if (item.data) setSelectedChannel(item.data);
                }}
                style={{ position: 'absolute', top: item.top, left: 0, right: 0, height: item.height }}
                className={`group px-4 py-1.5 cursor-pointer transition-transform duration-75 ${isFocused ? 'z-10' : 'z-0'}`}
            >
                <div className={`w-full h-full rounded-xl flex items-center gap-0 pl-0 pr-5 border overflow-hidden ${isFocused ? 'bg-[#111] border-white border-2 scale-[1.01]' : 'bg-[#111] border-white/5 hover:bg-white/5'}`}>
                    <div className="h-full w-[140px] bg-white flex items-center justify-center shrink-0 border-r border-white/5 p-2">
                         <img 
                           src={item.data?.logo} 
                           className="w-full h-full object-contain"
                           loading="lazy"
                           onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO}
                         />
                    </div>
                    <div className="flex-1 min-w-0 pl-6 flex flex-col justify-center">
                        <div className="flex items-baseline gap-3 mb-1">
                            <span className={`text-lg font-mono opacity-50 ${isFocused ? 'text-white' : 'text-gray-500'}`}>
                                {item.channelNumber}
                            </span>
                            <p className={`text-xl font-semibold truncate ${isFocused ? 'text-white' : 'text-gray-300'}`}>
                                {item.data?.name}
                            </p>
                        </div>
                        {/* EPG DISPLAY */}
                        {currentProg ? (
                           <div className="flex flex-col gap-1 pl-10">
                             <div className="flex justify-between items-baseline pr-4">
                                <span className={`text-sm truncate ${isFocused ? 'text-gray-200' : 'text-gray-400'}`}>
                                    {currentProg.title}
                                </span>
                                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                  {currentProg.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {currentProg.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                             </div>
                             <div className="h-1 w-2/3 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${itemProgress}%` }}></div>
                             </div>
                           </div>
                        ) : (
                           <p className="text-sm text-gray-600 pl-10">No Program Info</p>
                        )}
                    </div>
                </div>
            </div>
        );
    });
  };

  const currentHeader = useMemo(() => {
     if (flatItems.length === 0) return null;
     let idx = 0;
     for (let i = 0; i < flatItems.length; i++) {
        if (flatItems[i].top > scrollTop + HEADER_HEIGHT) break;
        if (flatItems[i].type === 'header') idx = i;
     }
     return flatItems[idx]?.type === 'header' ? flatItems[idx] : null;
  }, [scrollTop, flatItems]);

  const handleClosePlayer = useCallback(() => setSelectedChannel(null), []);

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar 
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
        allChannels={playlist.flatMap(g => g.channels)}
      />

      <div className="flex-1 flex flex-col h-full relative z-0">
        <header className="h-24 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] z-20 shadow-sm shrink-0">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">{activeCategory}</h2>
            <p className="text-gray-400 text-sm mt-1">
              {loading ? 'Loading...' : `${flatItems.filter(i => i.type === 'channel').length} channels`}
            </p>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative no-scrollbar">
          {loading ? (
             <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-20 w-full bg-white/5 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <>
                <div style={{ height: totalHeight, width: '100%' }} />
                {renderVirtualItems()}
                {currentHeader && (
                    <div className="sticky top-0 left-0 right-0 h-[50px] px-6 flex items-center bg-[#050505]/95 backdrop-blur-sm border-b border-white/5 z-20 shadow-md">
                        <span className="text-purple-400 text-sm font-bold uppercase tracking-wider">{currentHeader.title}</span>
                    </div>
                )}
            </>
          )}
        </div>
      </div>

      {selectedChannel && (
        <VideoPlayer 
          channel={selectedChannel} 
          allChannels={playlist.flatMap(g => g.channels)}
          epgData={epgData}
          onChannelSelect={setSelectedChannel}
          onClose={handleClosePlayer} 
        />
      )}
    </div>
  );
};

export default App;
