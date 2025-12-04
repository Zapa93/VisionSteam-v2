import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Channel } from '../types';
import { DEFAULT_LOGO } from '../constants';

interface VideoPlayerProps {
  channel: Channel;
  allChannels: Channel[];
  onClose: () => void;
  onChannelSelect: (channel: Channel) => void;
}

declare global {
  interface Window {
    Hls: any;
  }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, allChannels, onClose, onChannelSelect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  
  // UI State
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Derived State Logic to sync props with internal index immediately
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  if (channel.id !== prevChannelId) {
     const idx = allChannels.findIndex(c => c.id === channel.id);
     if (idx !== -1) {
        setSelectedIndex(idx);
        setPrevChannelId(channel.id);
     }
  }

  // Refs for Event Listener Access (Fixes Stale Closures)
  const channelRef = useRef(channel);
  const allChannelsRef = useRef(allChannels);
  const isListOpenRef = useRef(isListOpen);
  const selectedIndexRef = useRef(selectedIndex);
  const onCloseRef = useRef(onClose);
  
  // Sync Refs
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { allChannelsRef.current = allChannels; }, [allChannels]);
  useEffect(() => { isListOpenRef.current = isListOpen; }, [isListOpen]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Timers
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // --- VIRTUALIZATION LOGIC ---
  const ITEM_HEIGHT = 80; // px
  const LIST_HEIGHT = 1080; // Full viewport height for TV
  const RENDER_WINDOW = 30; // Render buffer
  
  // Scroll active item into view
  useEffect(() => {
    if (isListOpen && listContainerRef.current) {
      // Center the selected item
      const targetScroll = Math.max(0, selectedIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
      listContainerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' }); 
    }
  }, [selectedIndex, isListOpen]);

  // --- HISTORY API / BACK BUTTON TRAP ---
  useEffect(() => {
    // Push state ONLY once when component mounts
    window.history.pushState({ playerOpen: true }, '', window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // Use Ref to call the latest onClose without re-triggering effect
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up history only when component unmounts (player closes)
      if (window.history.state?.playerOpen) {
          window.history.back();
      }
    };
  }, []); // Empty dependency array is CRITICAL to prevent history.back() during channel switches

  // --- VIDEO LOGIC (Native HLS First + Infinite Retry) ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    setIsLoading(true);

    const loadStream = () => {
        setIsLoading(true);
        const url = channel.url;
        const isNativeSupported = video.canPlayType('application/vnd.apple.mpegurl');

        if (isNativeSupported) {
          console.log("Using Native HLS Playback");
          video.src = url;
          video.load();
        } else if (window.Hls && window.Hls.isSupported()) {
          console.log("Using HLS.js Playback");
          const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
          });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            video.play().catch(() => {});
          });

          hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              hls.destroy();
              retryConnection();
            }
          });
        } else {
           video.src = url;
        }
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
            console.log("Retrying connection...");
            loadStream();
        }, 3000);
    };

    const handleStreamReady = () => {
      setIsLoading(false);
      if (video.paused) {
        video.play().catch(() => {});
      }
    };

    const handleNativeError = (e: Event) => {
      console.warn("Native Video Error, retrying...", e);
      retryConnection();
    };

    video.addEventListener('loadedmetadata', handleStreamReady);
    video.addEventListener('canplay', handleStreamReady);
    video.addEventListener('playing', handleStreamReady);
    video.addEventListener('timeupdate', () => {
       if (video.currentTime > 0.1 && isLoading) setIsLoading(false);
    });
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

  // --- CONTROLS LOGIC ---
  const resetControls = useCallback(() => {
    // Access current list open state via Ref if needed, or rely on state update
    // Here strictly for UI visibility
    if (isListOpen) {
      setShowControls(false); 
      return;
    }
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
  }, [isListOpen]);

  useEffect(() => {
    window.addEventListener('mousemove', resetControls);
    return () => {
      window.removeEventListener('mousemove', resetControls);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControls]);

  // --- INPUT HANDLING (Using Refs to avoid Stale Closures) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControls();
      
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isEnter = e.key === 'Enter';
      const isUp = e.key === 'ArrowUp';
      const isDown = e.key === 'ArrowDown';

      // Access LIVE state
      const currentIsListOpen = isListOpenRef.current;
      const currentIdx = selectedIndexRef.current;
      const currentAllChannels = allChannelsRef.current;
      const currentChannel = channelRef.current;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (currentIsListOpen) {
          setIsListOpen(false);
        } else {
          // Trigger history back manually, which calls handlePopState, which calls onClose
          window.history.back();
        }
        return;
      }

      if (isUp) {
        e.preventDefault();
        e.stopPropagation(); // Stop scrolling parent
        if (!currentIsListOpen) {
          setIsListOpen(true);
        } else {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
      } else if (isDown) {
        e.preventDefault();
        e.stopPropagation(); // Stop scrolling parent
        if (!currentIsListOpen) {
          setIsListOpen(true);
        } else {
          setSelectedIndex(prev => Math.min(currentAllChannels.length - 1, prev + 1));
        }
      } else if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
        // CRITICAL: Stop propagation so the button on the underlying App page doesn't get clicked
        
        if (currentIsListOpen) {
          const target = currentAllChannels[currentIdx];
          
          // Strict ID Check using Refs
          if (target.id === currentChannel.id) {
             setIsListOpen(false);
          } else {
             onChannelSelect(target);
          }
        } else {
          setShowControls(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChannelSelect, resetControls]);

  // --- VIRTUAL LIST RENDERER ---
  const renderVirtualList = () => {
    if (!isListOpen) return null;

    const totalHeight = allChannels.length * ITEM_HEIGHT;
    let startIdx = Math.max(0, selectedIndex - Math.floor(RENDER_WINDOW / 2));
    
    if (startIdx + RENDER_WINDOW > allChannels.length) {
        startIdx = Math.max(0, allChannels.length - RENDER_WINDOW);
    }
    
    const endIdx = Math.min(allChannels.length, startIdx + RENDER_WINDOW);
    
    return (
      <div 
        ref={listContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar relative bg-zinc-900/95"
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {allChannels.slice(startIdx, endIdx).map((c, i) => {
            const actualIndex = startIdx + i;
            const isSelected = actualIndex === selectedIndex;
            const isActiveChannel = c.id === channel.id;
            
            return (
               <div 
                 key={c.id}
                 onClick={() => {
                   setSelectedIndex(actualIndex);
                   if (c.id === channel.id) {
                     setIsListOpen(false);
                   } else {
                     onChannelSelect(c);
                   }
                 }}
                 style={{
                   position: 'absolute',
                   top: `${actualIndex * ITEM_HEIGHT}px`,
                   left: 0,
                   right: 0,
                   height: `${ITEM_HEIGHT}px`
                 }}
                 className={`px-6 flex items-center gap-4 cursor-pointer
                   ${isSelected ? 'border-2 border-white' : 'border-2 border-transparent'} 
                   ${isActiveChannel ? 'text-green-400' : 'text-gray-300'}
                 `}
               >
                  <div className="w-12 h-12 rounded bg-black p-1 flex-shrink-0 flex items-center justify-center">
                    <img 
                      src={c.logo} 
                      className="max-w-full max-h-full object-contain" 
                      loading="lazy" 
                      onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isSelected ? 'text-white text-lg' : 'text-base'}`}>{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.group}</p>
                  </div>
                  {isActiveChannel && (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  )}
               </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-fade-in">
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        poster={channel.logo}
        autoPlay
        playsInline
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-4 bg-black/50 p-6 rounded-2xl backdrop-blur-sm">
             <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-white"></div>
          </div>
        </div>
      )}

      <div 
        className={`absolute top-0 left-0 bottom-0 w-96 bg-zinc-900 shadow-2xl z-30 transform transition-transform duration-200 ease-out flex flex-col ${isListOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b border-white/10 bg-zinc-900 z-10">
           <h2 className="text-xl font-bold text-white">Channels</h2>
           <p className="text-sm text-gray-400 mt-1">{allChannels.length} Available</p>
        </div>
        {renderVirtualList()}
      </div>

      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showControls && !isListOpen ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-12 flex items-end justify-between">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-xl bg-gray-900 p-2 border border-white/10 shadow-lg">
              <img 
                src={channel.logo} 
                alt={channel.name} 
                className="w-full h-full object-contain"
                onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO}
              />
            </div>
            <div>
               <h1 className="text-3xl font-bold text-white drop-shadow-md">{channel.name}</h1>
               <p className="text-gray-300 text-lg">{channel.group}</p>
            </div>
          </div>
          <div className="text-right">
             <div className="bg-red-600 px-3 py-1 inline-block rounded text-xs font-bold uppercase tracking-wider animate-pulse mb-2">Live</div>
             <p className="text-gray-400 text-sm">Press Up/Down for List • Back to Exit</p>
          </div>
        </div>
      </div>
    </div>
  );
};