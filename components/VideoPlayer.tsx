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

  // Timers
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // --- VIRTUALIZATION LOGIC ---
  const ITEM_HEIGHT = 80; // px
  const LIST_HEIGHT = 1080; // Full viewport height for TV
  const RENDER_WINDOW = 30; // Render ~2.5 screens worth of content to ensure smooth scrolling
  
  // Calculate index on mount/change
  useEffect(() => {
    const idx = allChannels.findIndex((c) => c.id === channel.id);
    if (idx !== -1) setSelectedIndex(idx);
  }, [channel.id, allChannels]);

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
    // Push a state so we can trap the back button
    window.history.pushState({ playerOpen: true }, '', window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // If the list is open, the keydown handler should have caught it. 
      // If we got here, it means we are actually navigating back.
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up history state if we are unmounting without popping
      if (window.history.state?.playerOpen) {
          window.history.back();
      }
    };
  }, [onClose]);

  // --- VIDEO LOGIC (Native HLS First + Infinite Retry) ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    setIsLoading(true);

    // Function to initialize playback
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
              console.log("HLS Fatal Error, retrying...", data);
              // Instead of showing error, destroy and retry
              hls.destroy();
              retryConnection();
            }
          });
        } else {
           // Not supported, try standard src (might work on some browsers)
           video.src = url;
        }
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
            console.log("Retrying connection...");
            loadStream();
        }, 3000); // Retry every 3 seconds
    };

    // Success Handler
    const handleStreamReady = () => {
      setIsLoading(false);
      if (video.paused) {
        video.play().catch(() => {});
      }
    };

    // Error Handler (Native)
    const handleNativeError = (e: Event) => {
      console.warn("Native Video Error, retrying...", e);
      retryConnection();
    };

    // Attach Listeners
    video.addEventListener('loadedmetadata', handleStreamReady);
    video.addEventListener('canplay', handleStreamReady);
    video.addEventListener('playing', handleStreamReady);
    video.addEventListener('timeupdate', () => {
       if (video.currentTime > 0.1 && isLoading) setIsLoading(false);
    });
    video.addEventListener('error', handleNativeError);
    video.addEventListener('stalled', retryConnection);

    // Initial Load
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

  // --- INPUT HANDLING ---
  const handleChannelSwitch = (target: Channel) => {
    if (target.id === channel.id) {
       setIsListOpen(false); // Just close the list if selecting same channel
    } else {
       onChannelSelect(target); // Zapping: Keep list open
    }
  };

  useEffect(() => {
    // Only attach key listeners if we are looking at this component's ID context? 
    // Actually no, App.tsx handles unmounting this component, so we are safe.
    // However, removing channel.id from deps makes it more stable.
    
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControls();
      
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isEnter = e.key === 'Enter';
      const isUp = e.key === 'ArrowUp';
      const isDown = e.key === 'ArrowDown';

      if (isBack) {
        // CRITICAL: Stop propagation immediately to prevent browser back action
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (isListOpen) {
          // Hierarchy 1: Close List
          setIsListOpen(false);
        } else {
          // Hierarchy 2: Close Player (Manual history back)
          window.history.back();
        }
        return;
      }

      if (isUp) {
        e.preventDefault();
        if (!isListOpen) {
          setIsListOpen(true);
        } else {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
      } else if (isDown) {
        e.preventDefault();
        if (!isListOpen) {
          setIsListOpen(true);
        } else {
          setSelectedIndex(prev => Math.min(allChannels.length - 1, prev + 1));
        }
      } else if (isEnter) {
        if (isListOpen) {
          e.preventDefault();
          handleChannelSwitch(allChannels[selectedIndex]);
        } else {
          setShowControls(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListOpen, selectedIndex, allChannels, onChannelSelect, resetControls]);

  // --- VIRTUAL LIST RENDERER ---
  const renderVirtualList = () => {
    if (!isListOpen) return null;

    const totalHeight = allChannels.length * ITEM_HEIGHT;
    
    // Calculate start index to keep selected item centered in the render window
    // We render RENDER_WINDOW items.
    let startIdx = Math.max(0, selectedIndex - Math.floor(RENDER_WINDOW / 2));
    
    // Adjust start index if we are near the end of the list to ensure full window is filled
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
                   handleChannelSwitch(c);
                 }}
                 style={{
                   position: 'absolute',
                   top: `${actualIndex * ITEM_HEIGHT}px`,
                   left: 0,
                   right: 0,
                   height: `${ITEM_HEIGHT}px`
                 }}
                 className={`px-6 flex items-center gap-4 cursor-pointer
                   ${isSelected ? 'border-2 border-white bg-white/5' : 'border-2 border-transparent'} 
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

      {/* Loading Spinner - Always show if loading (even during retry) */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-4 bg-black/50 p-6 rounded-2xl backdrop-blur-sm">
             <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-white"></div>
             {/* No text needed, cleaner look */}
          </div>
        </div>
      )}

      {/* Quick Channel Switcher (Overlay) */}
      <div 
        className={`absolute top-0 left-0 bottom-0 w-96 bg-zinc-900 shadow-2xl z-30 transform transition-transform duration-200 ease-out flex flex-col ${isListOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b border-white/10 bg-zinc-900 z-10">
           <h2 className="text-xl font-bold text-white">Channels</h2>
           <p className="text-sm text-gray-400 mt-1">{allChannels.length} Available</p>
        </div>
        {renderVirtualList()}
      </div>

      {/* Info Overlay (Bottom) */}
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