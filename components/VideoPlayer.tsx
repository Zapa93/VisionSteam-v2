
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Channel, EPGData, EPGProgram } from '../types';
import { DEFAULT_LOGO } from '../constants';
import { getCurrentProgram } from '../services/epgService';

interface VideoPlayerProps {
  channel: Channel;
  allChannels: Channel[];
  epgData: EPGData;
  onClose: () => void;
  onChannelSelect: (channel: Channel) => void;
}

declare global {
  interface Window { Hls: any; }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, allChannels, epgData, onClose, onChannelSelect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  // EPG Current Program State
  const [currentProgram, setCurrentProgram] = useState<EPGProgram | null>(null);
  const [progress, setProgress] = useState(0);

  // Derived State
  if (channel.id !== prevChannelId) {
     const idx = allChannels.findIndex(c => c.id === channel.id);
     if (idx !== -1) {
        setSelectedIndex(idx);
        setPrevChannelId(channel.id);
     }
  }

  // Update EPG info periodically
  useEffect(() => {
     const updateEPG = () => {
        if (channel.tvgId && epgData[channel.tvgId]) {
           const prog = getCurrentProgram(epgData[channel.tvgId]);
           setCurrentProgram(prog);
           if (prog) {
               const total = prog.end.getTime() - prog.start.getTime();
               const elapsed = new Date().getTime() - prog.start.getTime();
               setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
           } else {
               setProgress(0);
           }
        } else {
            setCurrentProgram(null);
            setProgress(0);
        }
     };
     
     updateEPG();
     const interval = setInterval(updateEPG, 30000); // Update every 30s
     return () => clearInterval(interval);
  }, [channel, epgData]);

  // Refs for Event Listeners
  const channelRef = useRef(channel);
  const allChannelsRef = useRef(allChannels);
  const isListOpenRef = useRef(isListOpen);
  const selectedIndexRef = useRef(selectedIndex);
  const onCloseRef = useRef(onClose);
  
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { allChannelsRef.current = allChannels; }, [allChannels]);
  useEffect(() => { isListOpenRef.current = isListOpen; }, [isListOpen]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // Virtualization
  const ITEM_HEIGHT = 50; 
  const LIST_HEIGHT = 520; 
  const RENDER_WINDOW = 40; 
  
  useEffect(() => {
    if (isListOpen && listContainerRef.current) {
      const targetScroll = Math.max(0, selectedIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
      listContainerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' }); 
    }
  }, [selectedIndex, isListOpen]);

  // History / Back
  useEffect(() => {
    // Only set up history state ONCE when mounting
    // We pass an empty dependency array so this effect doesn't re-run on channel change
    const state = { playerOpen: true, id: Date.now() };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = () => { 
        // Always use the latest onClose reference
        onCloseRef.current(); 
    };
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Only go back if we are still in the state we pushed
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
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 5000); // 5s timeout
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
      const isChUp = e.key === 'PageUp' || e.keyCode === 33 || e.key === 'ChannelUp';
      const isChDown = e.key === 'PageDown' || e.keyCode === 34 || e.key === 'ChannelDown';

      const currentIsListOpen = isListOpenRef.current;
      const currentIdx = selectedIndexRef.current;
      const currentAllChannels = allChannelsRef.current;
      const currentChannel = channelRef.current;

      if (isBack) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (currentIsListOpen) setIsListOpen(false);
        else window.history.back();
        return;
      }

      if (isUp) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) setIsListOpen(true);
        else setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (isDown) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) setIsListOpen(true);
        else setSelectedIndex(prev => Math.min(currentAllChannels.length - 1, prev + 1));
      } else if (isChUp) {
        e.preventDefault(); e.stopPropagation();
        // CH+ -> Next Channel (Down the list) - In list view, 1 step. Closed view, next channel.
        if (currentIsListOpen) setSelectedIndex(prev => Math.min(currentAllChannels.length - 1, prev + 1));
        else {
           const nextIdx = Math.min(currentAllChannels.length - 1, currentIdx + 1);
           if (nextIdx !== currentIdx) onChannelSelect(currentAllChannels[nextIdx]);
        }
      } else if (isChDown) {
        e.preventDefault(); e.stopPropagation();
        // CH- -> Prev Channel (Up the list)
        if (currentIsListOpen) setSelectedIndex(prev => Math.max(0, prev - 1));
        else {
            const prevIdx = Math.max(0, currentIdx - 1);
            if (prevIdx !== currentIdx) onChannelSelect(currentAllChannels[prevIdx]);
        }
      } else if (isEnter) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (currentIsListOpen) {
          const target = currentAllChannels[currentIdx];
          if (target.id === currentChannel.id) setIsListOpen(false);
          else onChannelSelect(target);
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

    const totalHeight = allChannels.length * ITEM_HEIGHT;
    let startIdx = Math.max(0, selectedIndex - Math.floor(RENDER_WINDOW / 2));
    if (startIdx + RENDER_WINDOW > allChannels.length) startIdx = Math.max(0, allChannels.length - RENDER_WINDOW);
    const endIdx = Math.min(allChannels.length, startIdx + RENDER_WINDOW);
    
    return (
      <div ref={listContainerRef} className="flex-1 overflow-y-auto no-scrollbar relative">
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {allChannels.slice(startIdx, endIdx).map((c, i) => {
            const actualIndex = startIdx + i;
            const isSelected = actualIndex === selectedIndex;
            const isActiveChannel = c.id === channel.id;
            
            // EPG for this item
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
                 onClick={() => {
                   setSelectedIndex(actualIndex);
                   if (c.id === channel.id) setIsListOpen(false);
                   else onChannelSelect(c);
                 }}
                 style={{ position: 'absolute', top: `${actualIndex * ITEM_HEIGHT}px`, left: 0, right: 0, height: `${ITEM_HEIGHT}px` }}
                 className={`flex items-center gap-0 cursor-pointer overflow-hidden transition-all duration-100 ${isSelected ? 'border-2 border-white bg-transparent z-10' : 'border-2 border-transparent'} ${isActiveChannel ? 'text-green-400' : 'text-gray-300'}`}
               >
                  <div className="h-full w-[90px] bg-white/5 flex items-center justify-center flex-shrink-0 border-r border-white/5 p-1">
                    <img src={c.logo} className="w-full h-full object-contain drop-shadow-md" loading="lazy" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
                  </div>
                  <div className="flex-1 min-w-0 pl-4 flex flex-col justify-center h-full">
                    <div className="flex justify-between items-baseline pr-4">
                        <p className={`font-bold truncate ${isSelected ? 'text-lg text-white' : 'text-base text-gray-400'}`}>{c.name}</p>
                        {prog && <span className="text-[10px] text-gray-500">{prog.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                    </div>
                    {prog ? (
                        <div className="flex flex-col gap-1 mt-0.5 pr-4">
                             <p className="text-[11px] text-gray-500 truncate leading-tight">{prog.title}</p>
                             <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-gray-500" style={{ width: `${itemProgress}%` }}></div>
                             </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-gray-600 truncate leading-tight">{c.group}</p>
                    )}
                  </div>
                  {isActiveChannel && <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50 mr-4"></div>}
               </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-fade-in">
      {/* Removed poster attribute to prevent stretched logo background */}
      <video ref={videoRef} className="w-full h-full object-contain bg-black" autoPlay playsInline />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center justify-center bg-black/60 p-8 rounded-3xl backdrop-blur-md border border-white/10 shadow-2xl">
             <div className="relative w-20 h-20">
                <svg className="animate-satisfy-spin w-full h-full" viewBox="0 0 50 50">
                  <circle
                    className="opacity-25"
                    cx="25"
                    cy="25"
                    r="20"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    className="animate-satisfy-dash shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                    cx="25"
                    cy="25"
                    r="20"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.9))" }}
                  />
                </svg>
             </div>
             <p className="text-white/80 font-medium tracking-widest mt-4 text-sm uppercase animate-pulse">Buffering</p>
          </div>
        </div>
      )}

      {/* LIST MODAL */}
      <div className={`fixed inset-0 z-40 flex items-center justify-center transition-all duration-300 ease-out ${isListOpen ? 'opacity-100 visible scale-100' : 'opacity-0 invisible scale-95'}`}>
        <div className="w-[900px] h-[650px] bg-black/60 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center shrink-0">
                <h2 className="text-3xl font-bold text-white tracking-tight">Channel List</h2>
                <span className="text-lg font-medium text-gray-400 bg-black/40 px-4 py-2 rounded-lg">{allChannels.length} Channels</span>
            </div>
            {renderVirtualList()}
        </div>
      </div>

      {/* CONTROLS OVERLAY */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showControls && !isListOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-12 flex items-end justify-between">
          <div className="flex items-end gap-6 w-3/4">
            <div className="h-28 w-28 rounded-xl bg-gray-900 p-3 border border-white/10 shadow-2xl shrink-0">
              <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
            </div>
            <div className="mb-1 flex-1">
               <h1 className="text-4xl font-bold text-white drop-shadow-md mb-2">{channel.name}</h1>
               {currentProgram ? (
                   <div className="space-y-2">
                       <div className="flex items-center gap-3">
                           <span className="text-xl text-gray-200 font-medium">{currentProgram.title}</span>
                           <span className="text-sm text-gray-400 bg-white/10 px-2 py-0.5 rounded">
                               {currentProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - {currentProgram.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                           </span>
                       </div>
                       {currentProgram.description && <p className="text-gray-300 text-sm line-clamp-2 mt-1 drop-shadow-sm">{currentProgram.description}</p>}
                       <div className="w-1/2 h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                       </div>
                   </div>
               ) : (
                   <p className="text-gray-300 text-xl">{channel.group}</p>
               )}
            </div>
          </div>
          <div className="text-right pb-1">
             <div className="bg-red-600 px-3 py-1 inline-block rounded text-xs font-bold uppercase tracking-wider animate-pulse mb-2">Live</div>
             <p className="text-gray-400 text-sm">CH+/- to Change • Back to Exit</p>
          </div>
        </div>
      </div>
    </div>
  );
};
