import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { Category, Channel, PlaylistData } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO } from './constants';

// --- CONSTANTS FOR VIRTUALIZATION ---
const CHANNEL_HEIGHT = 64; // px
const HEADER_HEIGHT = 42; // px
const RENDER_BUFFER = 5; // items above/below

interface FlatItem {
  type: 'header' | 'channel';
  id: string;
  top: number;
  height: number;
  data?: Channel;
  title?: string;
  index: number; // index in the flat array
}

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  
  // --- VIRTUAL LIST STATE ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  // --- FOCUS STATE ---
  const [activeSection, setActiveSection] = useState<'sidebar' | 'list'>('sidebar');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Load Playlist
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setPlaylist([]);
      const url = activeCategory === Category.KANALER ? ENTERTAINMENT_URL : SPORT_URL;
      const data = await fetchPlaylist(url);
      setPlaylist(data);
      setLoading(false);
      // Reset focus when category changes
      setActiveSection('sidebar');
      setFocusedIndex(-1);
    };
    loadData();
  }, [activeCategory]);

  // --- DATA FLATTENING (Memoized for Performance) ---
  const { items: flatItems, totalHeight } = useMemo(() => {
    const items: FlatItem[] = [];
    let currentTop = 0;
    
    playlist.forEach(group => {
      if (group.channels.length === 0) return;
      
      const isUncategorized = group.title.toLowerCase() === 'uncategorized';
      
      // Add Header
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
      
      // Add Channels
      group.channels.forEach(channel => {
        items.push({
          type: 'channel',
          id: channel.id,
          data: channel,
          top: currentTop,
          height: CHANNEL_HEIGHT,
          index: items.length
        });
        currentTop += CHANNEL_HEIGHT;
      });
    });
    
    return { items, totalHeight: currentTop };
  }, [playlist]);

  // --- MEASURE CONTAINER ---
  useEffect(() => {
    if (scrollRef.current) {
        setContainerHeight(scrollRef.current.clientHeight);
    }
    const handleResize = () => {
        if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- SCROLL HANDLER ---
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // --- SCROLL TO FOCUS ---
  useEffect(() => {
    if (activeSection === 'list' && focusedIndex !== -1 && scrollRef.current) {
      const item = flatItems[focusedIndex];
      if (item) {
        // Simple Viewport Check
        const currentScroll = scrollRef.current.scrollTop;
        const viewH = scrollRef.current.clientHeight;
        
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
    if (selectedChannel) return; // Disable when player is open

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      
      const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key);
      if (!isNav) return;

      if (activeSection === 'sidebar') {
        // --- SIDEBAR NAVIGATION ---
        if (e.key === 'ArrowRight') {
           e.preventDefault();
           // Switch to List
           setActiveSection('list');
           
           // If no focus yet, find first channel
           if (focusedIndex === -1) {
              const firstChannelIdx = flatItems.findIndex(i => i.type === 'channel');
              setFocusedIndex(firstChannelIdx !== -1 ? firstChannelIdx : 0);
           }
           // Explicitly blur sidebar button to remove native focus ring
           (document.activeElement as HTMLElement)?.blur();
           return;
        }
        
        // Manual Up/Down for Sidebar to guarantee navigation
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const categories = Object.values(Category);
            const currentVal = document.activeElement?.getAttribute('data-sidebar-item');
            
            // Find current index
            let idx = categories.findIndex(c => c === currentVal);
            
            // Fallback if focus is lost
            if (idx === -1) idx = categories.indexOf(activeCategory);
            
            if (e.key === 'ArrowDown') idx++;
            if (e.key === 'ArrowUp') idx--;
            
            // Clamp
            if (idx < 0) idx = 0;
            if (idx >= categories.length) idx = categories.length - 1;
            
            const targetCat = categories[idx];
            const btn = document.querySelector(`[data-sidebar-item="${targetCat}"]`) as HTMLElement;
            btn?.focus();
        }

        // Manual Enter support
        if (e.key === 'Enter') {
            const currentVal = document.activeElement?.getAttribute('data-sidebar-item');
            if (currentVal && currentVal !== activeCategory) {
               e.preventDefault();
               setActiveCategory(currentVal as Category);
            }
        }

      } else {
        // --- LIST NAVIGATION ---
        e.preventDefault(); // Stop native scrolling
        
        if (e.key === 'ArrowLeft') {
           setActiveSection('sidebar');
           // Focus the active category button
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
        if (e.key === 'ArrowUp') {
            nextIndex--;
        } else if (e.key === 'ArrowDown') {
            nextIndex++;
        }

        // Bounds check
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;

        // Skip Headers logic (optional, but good UX to skip selecting headers)
        // If landing on header, move one more step
        if (flatItems[nextIndex].type === 'header') {
            if (e.key === 'ArrowDown') nextIndex++;
            if (e.key === 'ArrowUp') nextIndex--;
        }
        
        // Final Bounds check
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;

        setFocusedIndex(nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, focusedIndex, flatItems, loading, selectedChannel, activeCategory]);

  // --- INITIAL FOCUS ON LOAD ---
  useEffect(() => {
    if (!loading && !selectedChannel && activeSection === 'sidebar') {
        setTimeout(() => {
           const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
           btn?.focus();
        }, 100);
    }
  }, [loading, selectedChannel, activeCategory]);

  // --- RENDER HELPERS ---
  const renderVirtualItems = () => {
    if (loading || flatItems.length === 0) return null;

    // Binary search or simple math to find start index
    // Since variable heights, linear scan is safer and fast enough for <5000 items on JS engine
    let startIndex = 0;
    // Optimization: Use binary search for start index
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
    
    // Find End Index
    let endIndex = startIndex;
    for (let i = startIndex; i < flatItems.length; i++) {
        if (flatItems[i].top > scrollTop + containerHeight + 100) {
            break;
        }
        endIndex = i;
    }

    return flatItems.slice(startIndex, endIndex + 1).map((item) => {
        if (item.type === 'header') {
            return (
                <div
                    key={item.id}
                    style={{
                        position: 'absolute',
                        top: item.top,
                        left: 0,
                        right: 0,
                        height: item.height
                    }}
                    className="flex items-center px-4 bg-[#050505] border-b border-white/5 z-0"
                >
                    <span className="text-purple-400 text-xs font-bold uppercase tracking-wider">{item.title}</span>
                </div>
            );
        }

        const isFocused = activeSection === 'list' && focusedIndex === item.index;

        return (
            <div
                key={item.id}
                onClick={() => {
                    setFocusedIndex(item.index);
                    setActiveSection('list');
                    if (item.data) setSelectedChannel(item.data);
                }}
                style={{
                    position: 'absolute',
                    top: item.top,
                    left: 0,
                    right: 0,
                    height: item.height
                }}
                className={`group px-2 py-1 cursor-pointer transition-transform duration-75 ${isFocused ? 'z-10' : 'z-0'}`}
            >
                <div 
                    className={`
                        w-full h-full rounded-lg flex items-center gap-4 px-3 border
                        ${isFocused 
                            ? 'bg-[#111] border-white border-2 scale-[1.01]' 
                            : 'bg-[#111] border-white/5 hover:bg-white/5'
                        }
                    `}
                >
                    <div className="w-10 h-8 bg-black/40 rounded flex items-center justify-center shrink-0">
                         <img 
                           src={item.data?.logo} 
                           className="max-w-full max-h-full object-contain"
                           loading="lazy"
                           onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO}
                         />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isFocused ? 'text-white' : 'text-gray-300'}`}>
                            {item.data?.name}
                        </p>
                    </div>
                </div>
            </div>
        );
    });
  };

  // Sticky Header Logic
  const currentHeader = useMemo(() => {
     if (flatItems.length === 0) return null;
     // Find the last header that is above the scroll top
     // We can search backwards from the first visible item
     let idx = 0;
     // Quick optimization: look near the focused index or scrollTop
     // Simple scan:
     for (let i = 0; i < flatItems.length; i++) {
        if (flatItems[i].top > scrollTop + HEADER_HEIGHT) break;
        if (flatItems[i].type === 'header') idx = i;
     }
     return flatItems[idx]?.type === 'header' ? flatItems[idx] : null;
  }, [scrollTop, flatItems]);

  // Stable Handler for Close
  const handleClosePlayer = useCallback(() => {
     setSelectedChannel(null);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar 
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
      />

      <div className="flex-1 flex flex-col h-full relative z-0">
        <header className="h-20 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] z-20 shadow-sm shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{activeCategory}</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {loading ? 'Loading...' : `${flatItems.filter(i => i.type === 'channel').length} channels`}
            </p>
          </div>
        </header>

        {/* VIRTUAL SCROLL CONTAINER */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto relative no-scrollbar"
        >
          {loading ? (
             <div className="p-6 space-y-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-14 w-full bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
                {/* Virtual Height Placeholder */}
                <div style={{ height: totalHeight, width: '100%' }} />
                
                {/* Rendered Window */}
                {renderVirtualItems()}

                {/* Sticky Header Overlay */}
                {currentHeader && (
                    <div className="sticky top-0 left-0 right-0 h-[42px] px-4 flex items-center bg-[#050505]/95 backdrop-blur-sm border-b border-white/5 z-20 shadow-md">
                        <span className="text-purple-400 text-xs font-bold uppercase tracking-wider">{currentHeader.title}</span>
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
          onChannelSelect={setSelectedChannel}
          onClose={handleClosePlayer} 
        />
      )}
    </div>
  );
};

export default App;