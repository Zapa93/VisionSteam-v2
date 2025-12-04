import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // --- VIRTUALIZATION LOGIC ---
  // Only render a small window of channels to maintain 60FPS on TV
  const ITEM_HEIGHT = 80; // px
  const OVERSCAN = 5; // items to render outside view
  const LIST_HEIGHT = 600; // approximate height of sidebar list
  
  // Calculate index on mount/change
  useEffect(() => {
    const idx = allChannels.findIndex((c) => c.id === channel.id);
    if (idx !== -1) setSelectedIndex(idx);
  }, [channel.id, allChannels]);

  // Scroll active item into view when list opens or index changes via keys
  useEffect(() => {
    if (isListOpen && listContainerRef.current) {
      // Simple scroll logic for the container
      const targetScroll = Math.max(0, selectedIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
      listContainerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' }); 
      // 'auto' is better for performance than 'smooth' on older TVs
    }
  }, [selectedIndex, isListOpen]);

  // --- VIDEO LOGIC ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    const loadVideo = () => {
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          startLevel: -1,
          xhrSetup: (xhr: any) => { xhr.withCredentials = false; },
        });
        
        hlsRef.current = hls;
        hls.loadSource(channel.url);
        hls.attachMedia(video);
        
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.play().catch(e => console.warn("Autoplay blocked:", e));
        });

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
           if (data.fatal) {
             switch (data.type) {
               case window.Hls.ErrorTypes.NETWORK_ERROR:
                 hls.startLoad();
                 break;
               case window.Hls.ErrorTypes.MEDIA_ERROR:
                 hls.recoverMediaError();
                 break;
               default:
                 hls.destroy();
                 setError("Stream Error");
                 break;
             }
           }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          video.play().catch(() => {});
        });
        video.addEventListener('error', () => {
            setError("Playback Error");
            setIsLoading(false);
        });
      } else {
        setError("Not Supported");
        setIsLoading(false);
      }
    };

    loadVideo();
    return () => hlsRef.current?.destroy();
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
       setIsListOpen(false); // Toggle close
    } else {
       onChannelSelect(target); // Zapping: Keep list open
       // Note: selectedIndex will update via the useEffect on prop change
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControls();
      
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isEnter = e.key === 'Enter';
      const isUp = e.key === 'ArrowUp';
      const isDown = e.key === 'ArrowDown';

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        if (isListOpen) {
          setIsListOpen(false);
        } else {
          onClose();
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
          // Just show controls
          setShowControls(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListOpen, selectedIndex, allChannels, onChannelSelect, onClose, resetControls, channel.id]);

  // --- VIRTUAL LIST RENDERER ---
  // Calculate which items to render based on scroll/selection
  // We center the window around the selected index for key nav, 
  // but for a true pointer-capable list, we render a larger slice.
  // For simplicity and performance, we'll render a slice based on selectedIndex since keys are primary.
  const renderVirtualList = () => {
    if (!isListOpen) return null;

    const totalHeight = allChannels.length * ITEM_HEIGHT;
    // Determine visible window based on selectedIndex (keeps selection centered-ish)
    // We want to show X items, ensuring we don't go out of bounds
    const startIdx = Math.max(0, Math.min(selectedIndex - 6, allChannels.length - 12));
    const endIdx = Math.min(allChannels.length, startIdx + 15);
    
    // We use absolute positioning to place items in the massive container
    return (
      <div 
        ref={listContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar relative bg-zinc-900/95"
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {/* Render only visible slice */}
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
                 className={`px-6 flex items-center gap-4 cursor-pointer transition-colors
                   ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'} 
                   ${isActiveChannel ? 'text-green-400' : 'text-gray-300'}
                 `}
               >
                  {/* Selection Indicator Bar */}
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                  
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
        crossOrigin="anonymous"
      />

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <p className="text-xl font-bold text-white mb-4">{error}</p>
            <button onClick={onClose} className="px-8 py-3 bg-white text-black rounded-full font-bold focus:scale-105 transition-transform">
              Close Player
            </button>
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