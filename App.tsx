
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { fetchEPG, getCurrentProgram } from './services/epgService';
import { Category, Channel, PlaylistData, EPGData, ChannelGroup } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO, MANUAL_EPG_URL } from './constants';

// --- CONSTANTS FOR VIRTUALIZATION ---
const CHANNEL_HEIGHT = 90; // px
const HEADER_HEIGHT = 50; // px

interface FlatItem {
  type: 'group' | 'channel'; // Removed 'header' as we use full group view
  id: string;
  top: number;
  height: number;
  data?: Channel;      // For type='channel'
  groupData?: ChannelGroup; // For type='group'
  title?: string;
  index: number; 
  channelNumber?: number;
  count?: number; // For groups
}

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ChannelGroup | null>(null);
  
  // EPG State
  const [epgData, setEpgData] = useState<EPGData>({});
  
  // --- VIRTUAL LIST STATE ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  // --- FOCUS STATE ---
  const [activeSection, setActiveSection] = useState<'sidebar' | 'list'>('sidebar');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [savedGroupIndex, setSavedGroupIndex] = useState<number>(0); // Restore focus when going back

  // Load Playlist & EPG
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setPlaylist([]);
      setEpgData({});
      setSelectedGroup(null); // Reset group on category change
      
      const url = activeCategory === Category.KANALER ? ENTERTAINMENT_URL : SPORT_URL;
      const { groups, epgUrl } = await fetchPlaylist(url);
      setPlaylist(groups);
      setLoading(false);
      
      // Reset focus
      setActiveSection('sidebar');
      setFocusedIndex(-1);
      setSavedGroupIndex(0);

      // Fetch EPG: Prioritize Manual URL if present
      const epgSource = MANUAL_EPG_URL || epgUrl;
      if (epgSource) {
          console.log("Fetching EPG from:", epgSource);
          fetchEPG(epgSource).then(data => setEpgData(data));
      }
    };
    loadData();
  }, [activeCategory]);

  // --- DATA FLATTENING ---
  const { items: flatItems, totalHeight } = useMemo(() => {
    const items: FlatItem[] = [];
    let currentTop = 0;
    
    if (!selectedGroup) {
        // --- VIEW 1: GROUPS LIST ---
        playlist.forEach((group) => {
             // Filter out empty groups if desired, keeping Uncategorized if it has channels
             if (group.channels.length === 0) return;
             
             items.push({
                 type: 'group',
                 id: `grp-${group.title}`,
                 title: group.title,
                 groupData: group,
                 top: currentTop,
                 height: CHANNEL_HEIGHT,
                 index: items.length,
                 count: group.channels.length
             });
             currentTop += CHANNEL_HEIGHT;
        });
    } else {
        // --- VIEW 2: CHANNELS IN GROUP ---
        selectedGroup.channels.forEach((channel, idx) => {
            items.push({
                type: 'channel',
                id: channel.id,
                data: channel,
                top: currentTop,
                height: CHANNEL_HEIGHT,
                index: items.length,
                channelNumber: idx + 1
            });
            currentTop += CHANNEL_HEIGHT;
        });
    }
    
    return { items, totalHeight: currentTop };
  }, [playlist, selectedGroup]);

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

      const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'PageUp', 'PageDown', 'Backspace', 'Escape'].includes(e.key) || e.keyCode === 461; // 461 is WebOS Back
      if (!isNav) return;

      // Global Back Handling
      if (e.key === 'Backspace' || e.key === 'Escape' || e.keyCode === 461) {
          if (selectedGroup) {
              e.preventDefault();
              setSelectedGroup(null);
              setFocusedIndex(savedGroupIndex); // Restore focus to the group we just left
              setActiveSection('list');
              return;
          }
          // If no group selected, standard behavior (exit app or do nothing)
          return;
      }

      if (activeSection === 'sidebar') {
        if (e.key === 'ArrowRight') {
           e.preventDefault();
           setActiveSection('list');
           if (focusedIndex === -1) {
              setFocusedIndex(0);
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
        // IN LIST
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
            if (!item) return;

            if (item.type === 'group' && item.groupData) {
                // Enter Group
                setSavedGroupIndex(focusedIndex); // Save where we were
                setSelectedGroup(item.groupData);
                setFocusedIndex(0); // Reset focus for new list
                // Scroll reset is automatic due to item change but explicit check
                if (scrollRef.current) scrollRef.current.scrollTo(0,0);
            } else if (item.type === 'channel' && item.data) {
                // Play Channel
                setSelectedChannel(item.data);
            }
            return;
        }

        let nextIndex = focusedIndex;
        if (e.key === 'ArrowUp') nextIndex--;
        else if (e.key === 'ArrowDown') nextIndex++;
        else if (e.key === 'PageUp') nextIndex -= 5;
        else if (e.key === 'PageDown') nextIndex += 5;

        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;
        
        setFocusedIndex(nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, focusedIndex, flatItems, loading, selectedChannel, activeCategory, selectedGroup, savedGroupIndex]);

  // --- RENDER HELPERS ---
  const renderVirtualItems = () => {
    if (loading || flatItems.length === 0) return null;

    let startIndex = 0;
    // Simple Viewport Culling
    const buffer = 300; // px
    const topBound = Math.max(0, scrollTop - buffer);
    const bottomBound = scrollTop + containerHeight + buffer;

    // Binary search roughly
    let low = 0, high = flatItems.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (flatItems[mid].top + flatItems[mid].height < topBound) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    startIndex = Math.max(0, low);
    
    let endIndex = startIndex;
    for (let i = startIndex; i < flatItems.length; i++) {
        if (flatItems[i].top > bottomBound) break;
        endIndex = i;
    }

    return flatItems.slice(startIndex, endIndex + 1).map((item) => {
        const isFocused = activeSection === 'list' && focusedIndex === item.index;

        if (item.type === 'group') {
            return (
                <div
                    key={item.id}
                    onMouseEnter={() => {
                        setFocusedIndex(item.index);
                        setActiveSection('list');
                    }}
                    onMouseMove={() => {
                       if (activeSection !== 'list' || focusedIndex !== item.index) {
                          setFocusedIndex(item.index);
                          setActiveSection('list');
                       }
                    }}
                    onClick={() => {
                        setFocusedIndex(item.index);
                        setActiveSection('list');
                        if (item.groupData) {
                            setSavedGroupIndex(item.index);
                            setSelectedGroup(item.groupData);
                            setFocusedIndex(0);
                            if (scrollRef.current) scrollRef.current.scrollTo(0,0);
                        }
                    }}
                    style={{ position: 'absolute', top: item.top, left: 0, right: 0, height: item.height }}
                    className={`group px-4 py-1.5 cursor-pointer ${isFocused ? 'z-10' : 'z-0'}`}
                >
                     <div className={`w-full h-full rounded-xl flex items-center px-6 border transition-transform duration-100 ${isFocused ? 'bg-[#222] border-white border-2 scale-[1.01]' : 'bg-[#161616] border-white/5 hover:bg-white/5'}`}>
                        {/* Folder Icon */}
                        <div className={`w-14 h-14 flex items-center justify-center rounded-lg ${isFocused ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                             </svg>
                        </div>
                        <div className="ml-6 flex-1">
                             <h3 className={`text-2xl font-bold truncate ${isFocused ? 'text-white' : 'text-gray-200'}`}>{item.title}</h3>
                             <p className="text-gray-500 text-sm mt-1">{item.count} Channels</p>
                        </div>
                        <div className={`p-2 rounded-full ${isFocused ? 'bg-white/20' : 'bg-transparent'}`}>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                             </svg>
                        </div>
                     </div>
                </div>
            );
        }

        // --- CHANNEL ITEM RENDERER ---
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
                onMouseMove={() => {
                   if (activeSection !== 'list' || focusedIndex !== item.index) {
                      setFocusedIndex(item.index);
                      setActiveSection('list');
                   }
                }}
                onClick={() => {
                    setFocusedIndex(item.index);
                    setActiveSection('list');
                    if (item.data) setSelectedChannel(item.data);
                }}
                style={{ position: 'absolute', top: item.top, left: 0, right: 0, height: item.height }}
                className={`group px-4 py-1.5 cursor-pointer ${isFocused ? 'z-10' : 'z-0'}`}
            >
                <div className={`w-full h-full rounded-xl flex items-center gap-0 pl-0 pr-5 border overflow-hidden ${isFocused ? 'bg-[#111] border-white border-2' : 'bg-[#111] border-white/5 hover:bg-white/5'}`}>
                    <div className="h-full w-[140px] bg-gray-300 flex items-center justify-center shrink-0 border-r border-white/5 p-2">
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
                                  {currentProg.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})} - {currentProg.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
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

  const handleClosePlayer = useCallback(() => setSelectedChannel(null), []);

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar 
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
        allChannels={playlist.flatMap(g => g.channels)}
        epgData={epgData}
        onChannelSelect={setSelectedChannel}
      />

      <div className="flex-1 flex flex-col h-full relative z-0">
        <header className="h-24 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] z-20 shadow-sm shrink-0">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-3xl font-bold text-white tracking-tight">{activeCategory}</h2>
               {selectedGroup && (
                   <>
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h2 className="text-3xl font-bold text-purple-400 tracking-tight">{selectedGroup.title}</h2>
                   </>
               )}
            </div>
            <p className="text-gray-400 text-sm mt-1">
              {loading 
                 ? 'Loading...' 
                 : selectedGroup 
                    ? `${selectedGroup.channels.length} channels`
                    : `${playlist.length} Groups`
              }
            </p>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative no-scrollbar">
          {loading ? (
             <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-20 w-full bg-white/5 rounded-lg opacity-50" />)}
            </div>
          ) : (
            <>
                <div style={{ height: totalHeight, width: '100%' }} />
                {renderVirtualItems()}
            </>
          )}
        </div>
      </div>

      {selectedChannel && (
        <VideoPlayer 
          channel={selectedChannel} 
          allChannels={selectedGroup ? selectedGroup.channels : playlist.flatMap(g => g.channels)}
          playlist={playlist}
          epgData={epgData}
          onChannelSelect={setSelectedChannel}
          onClose={handleClosePlayer} 
        />
      )}
    </div>
  );
};

export default App;
