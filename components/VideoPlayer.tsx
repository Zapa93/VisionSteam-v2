
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Channel, EPGData, EPGProgram, ChannelGroup } from '../types';
import { DEFAULT_LOGO } from '../constants';
import { getCurrentProgram, getNextProgram } from '../services/epgService';

interface VideoPlayerProps {
  channel: Channel;
  allChannels: Channel[]; // Default list (if needed)
  playlist: ChannelGroup[]; // All groups for switching
  epgData: EPGData;
  onClose: () => void;
  onChannelSelect: (channel: Channel) => void;
}

declare global {
  interface Window { Hls: any; }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, allChannels, playlist, epgData, onClose, onChannelSelect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  
  // State for virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  // EPG Current Program State
  const [currentProgram, setCurrentProgram] = useState<EPGProgram | null>(null);
  const [nextProgram, setNextProgram] = useState<EPGProgram | null>(null);
  const [progress, setProgress] = useState(0);

  // Navigation State
  const [viewMode, setViewMode] = useState<'channels' | 'groups'>('channels');
  const [focusArea, setFocusArea] = useState<'list' | 'sidebar'>('list');
  
  // Data State
  // We maintain a local list of channels because the user might switch groups inside the player
  const [currentChannelList, setCurrentChannelList] = useState<Channel[]>(allChannels);
  const [currentGroup, setCurrentGroup] = useState<ChannelGroup | null>(() => {
      return playlist.find(g => g.title === channel.group) || null;
  });

  // Derived State Sync
  if (channel.id !== prevChannelId) {
     const idx = currentChannelList.findIndex(c => c.id === channel.id);
     if (idx !== -1) {
        setSelectedIndex(idx);
        setPrevChannelId(channel.id);
     } else {
        // If channel changed externally or isn't in current list, try to find it in playlist
        // This might happen if 'onChannelSelect' triggered a prop update
        const group = playlist.find(g => g.title === channel.group);
        if (group) {
            setCurrentGroup(group);
            setCurrentChannelList(group.channels);
            const newIdx = group.channels.findIndex(c => c.id === channel.id);
            if (newIdx !== -1) setSelectedIndex(newIdx);
        }
        setPrevChannelId(channel.id);
     }
  }

  // Update EPG info periodically
  useEffect(() => {
     const updateEPG = () => {
        if (channel.tvgId && epgData[channel.tvgId]) {
           const prog = getCurrentProgram(epgData[channel.tvgId]);
           const next = getNextProgram(epgData[channel.tvgId]);
           
           setCurrentProgram(prog);
           setNextProgram(next);

           if (prog) {
               const total = prog.end.getTime() - prog.start.getTime();
               const elapsed = new Date().getTime() - prog.start.getTime();
               setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
           } else {
               setProgress(0);
           }
        } else {
            setCurrentProgram(null);
            setNextProgram(null);
            setProgress(0);
        }
     };
     
     updateEPG();
     const interval = setInterval(updateEPG, 30000); // Update every 30s
     return () => clearInterval(interval);
  }, [channel, epgData]);

  // Refs for Event Listeners
  const channelRef = useRef(channel);
  const currentChannelListRef = useRef(currentChannelList);
  const playlistRef = useRef(playlist);
  const isListOpenRef = useRef(isListOpen);
  const selectedIndexRef = useRef(selectedIndex);
  const viewModeRef = useRef(viewMode);
  const focusAreaRef = useRef(focusArea);
  const onCloseRef = useRef(onClose);
  
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { currentChannelListRef.current = currentChannelList; }, [currentChannelList]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { isListOpenRef.current = isListOpen; }, [isListOpen]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { focusAreaRef.current = focusArea; }, [focusArea]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // Virtualization Constants
  const ITEM_HEIGHT = 65; 
  const LIST_HEIGHT = 800; 
  const RENDER_BUFFER = 40; 

  // Auto-scroll logic
  useEffect(() => {
    if (isListOpen && listContainerRef.current) {
      const currentScroll = listContainerRef.current.scrollTop;
      const itemTop = selectedIndex * ITEM_HEIGHT;
      const itemBottom = itemTop + ITEM_HEIGHT;
      
      if (itemTop < currentScroll || itemBottom > currentScroll + LIST_HEIGHT) {
         const targetScroll = Math.max(0, selectedIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
         listContainerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' }); 
      }
    }
  }, [selectedIndex, isListOpen, viewMode]);

  // History / Back
  useEffect(() => {
    const state = { playerOpen: true, id: Date.now() };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = (_event: PopStateEvent) => { 
        if (isListOpenRef.current) {
            setIsListOpen(false);
            window.history.pushState({ playerOpen: true, id: Date.now() }, '', window.location.href);
        } else {
             onCloseRef.current(); 
        }
    };
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.playerOpen) {
          window.history.back();
      }
    };
  }, []);

  // Video Logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    
    setIsLoading(true);

    const loadStream = () => {
        setIsLoading(true);
        const url = channel.url;
        const isNativeSupported = video.canPlayType('application/vnd.apple.mpegurl');

        if (isNativeSupported) {
          console.log("Using Native HLS");
          video.src = url;
          video.load();
        } else if (window.Hls && window.Hls.isSupported()) {
          console.log("Using HLS.js");
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => { setIsLoading(false); video.play().catch(() => {}); });
          hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) { hls.destroy(); retryConnection(); }
          });
        } else {
           video.src = url;
        }
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => { console.log("Retrying..."); loadStream(); }, 3000);
    };

    const handleStreamReady = () => { setIsLoading(false); if (video.paused) video.play().catch(() => {}); };
    const handleNativeError = () => { retryConnection(); };

    video.addEventListener('loadedmetadata', handleStreamReady);
    video.addEventListener('canplay', handleStreamReady);
    video.addEventListener('playing', handleStreamReady);
    video.addEventListener('timeupdate', () => { if (video.currentTime > 0.1 && isLoading) setIsLoading(false); });
    video.addEventListener('error', handleNativeError);
    video.addEventListener('stalled', retryConnection);

    loadStream();

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      video.removeEventListener('loadedmetadata', handleStreamReady);
      video.removeEventListener('canplay', handleStreamReady);
      video.removeEventListener('playing', handleStreamReady);
      video.removeEventListener('error', handleNativeError);
      video.removeEventListener('stalled', retryConnection);
      video.removeAttribute('src'); 
      video.load();
    };
  }, [channel]);

  // Controls Logic
  const resetControls = useCallback(() => {
    if (isListOpen) { setShowControls(false); return; }
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 5000); 
  }, [isListOpen]);

  useEffect(() => {
    window.addEventListener('mousemove', resetControls);
    return () => {
      window.removeEventListener('mousemove', resetControls);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControls]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControls();
      
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isEnter = e.key === 'Enter';
      const isUp = e.key === 'ArrowUp';
      const isDown = e.key === 'ArrowDown';
      const isLeft = e.key === 'ArrowLeft';
      const isRight = e.key === 'ArrowRight';
      const isChUp = e.key === 'PageUp' || e.keyCode === 33 || e.key === 'ChannelUp';
      const isChDown = e.key === 'PageDown' || e.keyCode === 34 || e.key === 'ChannelDown';

      const currentIsListOpen = isListOpenRef.current;
      const currentIdx = selectedIndexRef.current;
      const currentList = currentChannelListRef.current;
      const currentView = viewModeRef.current;
      const currentFocus = focusAreaRef.current;
      const currentGroups = playlistRef.current;

      const activeListLength = currentView === 'channels' ? currentList.length : currentGroups.length;

      if (isBack) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (currentIsListOpen) {
            // If in Groups view, go back to channels if possible, or close list
            if (currentView === 'groups') {
                 // Try to revert to current channel's group view
                 setViewMode('channels');
                 setFocusArea('list');
                 // Reset index to current channel
                 const currentChan = channelRef.current;
                 const idx = currentList.findIndex(c => c.id === currentChan.id);
                 setSelectedIndex(idx !== -1 ? idx : 0);
            } else {
                 setIsListOpen(false);
            }
        } else {
            window.history.back(); 
        }
        return;
      }

      if (isLeft) {
          if (currentIsListOpen && currentView === 'channels' && currentFocus === 'list') {
              e.preventDefault(); e.stopPropagation();
              setFocusArea('sidebar');
          }
      } else if (isRight) {
          if (currentIsListOpen && currentView === 'channels' && currentFocus === 'sidebar') {
              e.preventDefault(); e.stopPropagation();
              setFocusArea('list');
          }
      } else if (isUp) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) setIsListOpen(true);
        else if (currentFocus === 'list') {
            setSelectedIndex(prev => Math.max(0, prev - 1));
        }
      } else if (isDown) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) setIsListOpen(true);
        else if (currentFocus === 'list') {
            setSelectedIndex(prev => Math.min(activeListLength - 1, prev + 1));
        }
      } else if (isChUp) { // PageUp -> Next -> Index + 1
        e.preventDefault(); e.stopPropagation();
        if (currentIsListOpen && currentFocus === 'list') {
             setSelectedIndex(prev => Math.min(activeListLength - 1, prev + 1));
        } else if (!currentIsListOpen) {
           const nextIdx = Math.min(currentList.length - 1, currentIdx + 1);
           if (nextIdx !== currentIdx) onChannelSelect(currentList[nextIdx]);
        }
      } else if (isChDown) { // PageDown -> Prev -> Index - 1
        e.preventDefault(); e.stopPropagation();
        if (currentIsListOpen && currentFocus === 'list') {
             setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (!currentIsListOpen) {
            const prevIdx = Math.max(0, currentIdx - 1);
            if (prevIdx !== currentIdx) onChannelSelect(currentList[prevIdx]);
        }
      } else if (isEnter) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        
        if (currentIsListOpen) {
          if (currentFocus === 'sidebar') {
               // Clicked "Group Name" button -> Switch to Group View
               setViewMode('groups');
               setFocusArea('list');
               setSelectedIndex(0);
               return;
          }

          if (currentView === 'groups') {
               // Clicked a Group -> Enter Group
               const selectedGroup = currentGroups[currentIdx];
               setCurrentGroup(selectedGroup);
               setCurrentChannelList(selectedGroup.channels);
               setViewMode('channels');
               setSelectedIndex(0);
               if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
          } else {
               // Clicked a Channel -> Play Channel
               const target = currentList[currentIdx];
               if (target.id === channelRef.current.id) setIsListOpen(false);
               else onChannelSelect(target);
          }
        } else {
          setIsListOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChannelSelect, resetControls]);

  // Render Virtual List
  const renderVirtualList = () => {
    if (!isListOpen) return null;

    const dataList = viewMode === 'channels' ? currentChannelList : playlist;
    const totalHeight = dataList.length * ITEM_HEIGHT;
    const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
    const renderStart = Math.max(0, startIndex - RENDER_BUFFER);
    const renderEnd = Math.min(dataList.length, startIndex + Math.ceil(LIST_HEIGHT / ITEM_HEIGHT) + RENDER_BUFFER);
    
    // Safety check for empty lists
    if (dataList.length === 0) return <div className="p-8 text-gray-500">No items found</div>;

    return (
      <div 
        ref={listContainerRef} 
        className="flex-1 overflow-y-auto no-scrollbar relative"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {dataList.slice(renderStart, renderEnd).map((item, i) => {
            const actualIndex = renderStart + i;
            const isSelected = actualIndex === selectedIndex && focusArea === 'list';
            
            // --- GROUP RENDERER ---
            if (viewMode === 'groups') {
                const group = item as ChannelGroup;
                const isActiveGroup = currentGroup?.title === group.title;
                
                return (
                    <div
                        key={group.title}
                        onMouseEnter={() => {
                            if (focusArea === 'sidebar') setFocusArea('list');
                            setSelectedIndex(actualIndex);
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setCurrentGroup(group);
                            setCurrentChannelList(group.channels);
                            setViewMode('channels');
                            setSelectedIndex(0);
                            if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
                        }}
                        style={{ position: 'absolute', top: `${actualIndex * ITEM_HEIGHT}px`, left: 0, right: 0, height: `${ITEM_HEIGHT}px` }}
                        className={`flex items-center gap-4 px-6 cursor-pointer ${isSelected ? 'bg-white/10' : ''}`}
                    >
                         <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${isSelected ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                             </svg>
                         </div>
                         <div className="flex-1">
                             <h3 className={`text-xl font-bold truncate ${isSelected || isActiveGroup ? 'text-white' : 'text-gray-300'}`}>{group.title}</h3>
                             <p className="text-gray-500 text-xs">{group.channels.length} Channels</p>
                         </div>
                         {isSelected && (
                             <div className="bg-white text-black rounded-full p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                             </div>
                         )}
                    </div>
                );
            }

            // --- CHANNEL RENDERER ---
            const c = item as Channel;
            const isActiveChannel = c.id === channel.id;
            const prog = c.tvgId ? getCurrentProgram(epgData[c.tvgId]) : null;
            let itemProgress = 0;
            if (prog) {
                const t = prog.end.getTime() - prog.start.getTime();
                const e = new Date().getTime() - prog.start.getTime();
                itemProgress = Math.min(100, Math.max(0, (e / t) * 100));
            }

            return (
               <div 
                 key={c.id}
                 onMouseEnter={() => {
                     if (focusArea === 'sidebar') setFocusArea('list');
                     setSelectedIndex(actualIndex);
                 }}
                 onClick={(e) => {
                   e.stopPropagation(); 
                   setSelectedIndex(actualIndex);
                   if (c.id === channel.id) setIsListOpen(false);
                   else onChannelSelect(c);
                 }}
                 style={{ position: 'absolute', top: `${actualIndex * ITEM_HEIGHT}px`, left: 0, right: 0, height: `${ITEM_HEIGHT}px` }}
                 className={`flex items-center gap-0 cursor-pointer overflow-hidden ${isSelected ? 'border-2 border-white z-10' : 'border-2 border-transparent'} ${isActiveChannel ? 'text-green-400' : 'text-gray-200'}`}
               >
                  <div className="h-full w-[90px] bg-gray-300 flex items-center justify-center flex-shrink-0 border-r border-white/5 p-2">
                    <img 
                        src={c.logo} 
                        className="w-full h-full object-contain" 
                        loading="lazy" 
                        onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} 
                    />
                  </div>
                  <div className="flex-1 min-w-0 pl-4 flex flex-col justify-center h-full bg-black/40">
                    <div className="flex justify-between items-baseline pr-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                           <span 
                             className="text-2xl font-mono font-bold text-white flex-shrink-0"
                             style={{ textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}
                           >
                             {actualIndex + 1}
                           </span>
                           <p className={`font-bold truncate ${isSelected ? 'text-lg text-white' : 'text-base text-gray-200'}`}>{c.name}</p>
                        </div>
                        {prog && <span className="text-xs text-gray-400 shrink-0">{prog.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}</span>}
                    </div>
                    {prog ? (
                        <div className="flex flex-col gap-0.5 mt-0.5 pr-4">
                             <p className={`text-[13px] truncate leading-tight ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{prog.title}</p>
                             <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${itemProgress}%` }}></div>
                             </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-gray-500 truncate leading-tight pl-0.5 mt-0.5 italic">No Program Info</p>
                    )}
                  </div>
                  {isActiveChannel && <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50 mr-4 shrink-0"></div>}
               </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <video 
        ref={videoRef} 
        className="w-full h-full object-contain bg-black cursor-pointer" 
        autoPlay 
        playsInline 
        onClick={() => {
           if (!isListOpen) setIsListOpen(true);
        }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center justify-center bg-black/60 p-8 rounded-3xl border border-white/10">
             <div className="relative w-20 h-20">
                <svg className="animate-satisfy-spin w-full h-full" viewBox="0 0 50 50">
                  <circle className="opacity-25" cx="25" cy="25" r="20" stroke="white" strokeWidth="4" fill="none" />
                  <circle
                    className="animate-satisfy-dash"
                    cx="25" cy="25" r="20"
                    stroke="white" strokeWidth="4"
                    fill="none" strokeLinecap="round"
                  />
                </svg>
             </div>
             <p className="text-white/80 font-medium tracking-widest mt-4 text-sm uppercase">Buffering</p>
          </div>
        </div>
      )}

      {/* LIST MODAL */}
      <div 
        className={`fixed inset-0 z-40 flex items-center justify-center ${isListOpen ? 'visible' : 'invisible'}`}
        onClick={() => setIsListOpen(false)}
      >
        <div 
            className="w-[1100px] h-[900px] bg-[#111] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center shrink-0">
                <h2 className="text-4xl font-bold text-white tracking-tight">
                    {viewMode === 'groups' ? 'All Groups' : (currentGroup?.title || 'Channels')}
                </h2>
                <span className="text-xl font-medium text-gray-400 bg-black/40 px-4 py-2 rounded-lg">
                    {viewMode === 'groups' ? playlist.length : currentChannelList.length} Items
                </span>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
                {/* SIDEBAR FOR SWITCHING GROUPS */}
                {viewMode === 'channels' && (
                    <div className="w-[200px] bg-black/20 border-r border-white/5 p-2 flex flex-col gap-2 shrink-0">
                        <div 
                            className={`p-4 rounded-xl border border-white/10 text-center cursor-pointer transition-all ${focusArea === 'sidebar' ? 'bg-purple-600 text-white border-white scale-105 shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            onClick={() => {
                                setViewMode('groups');
                                setFocusArea('list');
                            }}
                            onMouseEnter={() => setFocusArea('sidebar')}
                        >
                            <div className="text-xs uppercase font-bold tracking-wider mb-1">Current Group</div>
                            <div className="font-bold text-lg leading-tight line-clamp-2">{currentGroup?.title || 'All'}</div>
                            <div className="mt-2 text-xs opacity-75 flex items-center justify-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                                Change
                            </div>
                        </div>
                    </div>
                )}
                
                {/* LIST CONTENT */}
                {renderVirtualList()}
            </div>
        </div>
      </div>

      {/* CONTROLS OVERLAY */}
      <div className={`absolute inset-0 pointer-events-none ${showControls && !isListOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-12 flex items-end justify-between">
          <div className="flex items-end gap-6 w-3/4">
            <div className="h-28 w-28 rounded-xl bg-gray-300 p-2 border border-white/10 shrink-0 flex items-center justify-center">
              <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
            </div>
            <div className="mb-1 flex-1">
               <h1 className="text-4xl font-bold text-white mb-3">{channel.name}</h1>
               {currentProgram ? (
                   <div className="mb-3">
                       <div className="flex items-baseline gap-2 mb-1">
                           <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase">Now</span>
                           <span className="text-4xl text-white font-medium">{currentProgram.title}</span>
                           <span className="text-lg text-gray-300 ml-2">
                               {currentProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})} - {currentProgram.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                           </span>
                       </div>
                       <div className="w-2/3 h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                       </div>
                       {currentProgram.description && (
                           <p className="text-gray-300 text-lg line-clamp-2">{currentProgram.description}</p>
                       )}
                   </div>
               ) : (
                   <p className="text-xl text-gray-400 mb-2">No Program Information</p>
               )}

               {nextProgram && (
                   <div className="flex items-center gap-2 opacity-80">
                        <span className="text-xs font-bold bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">Next</span>
                        <span className="text-lg text-gray-300 truncate">{nextProgram.title}</span>
                        <span className="text-xs text-gray-500">
                             {nextProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                        </span>
                   </div>
               )}
            </div>
          </div>
          <div className="text-right pb-1">
             <div className="bg-red-600 px-3 py-1 inline-block rounded text-xs font-bold uppercase tracking-wider mb-2">Live</div>
             <p className="text-gray-400 text-sm">CH+/- to Change • Back to Exit</p>
          </div>
        </div>
      </div>
    </div>
  );
};
