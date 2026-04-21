'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface FeedItem {
  id: number;
  spotifyTrackId: string;
  trackName: string;
  artistNames: string;
  albumImageUrl: string;
  playedAt: string;
  isNowPlaying?: boolean;
  user: {
    id: number;
    spotifyId: string;
    displayName: string;
    profileImageUrl: string;
  };
}

interface NowPlayingTrack {
  isPlaying: boolean;
  item?: {
    id: string;
    name: string;
    artists: Array<{ name: string }>;
    album?: {
      images: Array<{ url: string }>;
    };
  };
  progress_ms?: number;
}

export default function FriendsFeedPage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nowPlayingTrack, setNowPlayingTrack] = useState<NowPlayingTrack | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [showRefreshAlert, setShowRefreshAlert] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nowPlayingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

   // Fetch the currently playing track
   const fetchNowPlaying = async () => {
     try {
       const response = await fetch('/api/now-playing', {
         credentials: 'include'
       });
       if (response.ok) {
         const data = await response.json();
         setNowPlayingTrack(data);
       }
     } catch (err) {
       console.error('Error fetching now playing:', err);
     }
   };

   // Fetch preview URL
   const fetchPreview = async (trackName: string, artistNames: string, trackId: string) => {
     try {
       setPreviewLoading(true);
       const response = await fetch(`/api/enhanced-preview?songName=${encodeURIComponent(trackName)}&artistName=${encodeURIComponent(artistNames)}&trackId=${encodeURIComponent(trackId)}`, {
         credentials: 'include'
       });
       if (response.ok) {
         const data = await response.json();
         setPreviewUrl(data.previewUrl);
       }
     } catch (err) {
       console.error('Error fetching preview:', err);
     } finally {
       setPreviewLoading(false);
     }
   };

   // Handle preview play/pause
   const handlePlayPreview = async () => {
     const displayItems = buildDisplayItems();
     const currentItem = displayItems[currentIndex];

     if (!previewUrl && !previewLoading) {
       await fetchPreview(currentItem.trackName, currentItem.artistNames, currentItem.spotifyTrackId);
     }

     if (audioRef.current) {
       if (isPlayingPreview) {
         audioRef.current.pause();
         setIsPlayingPreview(false);
       } else {
         if (previewUrl) {
           audioRef.current.src = previewUrl;
           audioRef.current.play().catch(err => {
             console.error('Error playing preview:', err);
             setIsPlayingPreview(false);
           });
           setIsPlayingPreview(true);
         }
       }
     }
   };

  // Initial feed fetch
  const fetchFeed = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/friends-feed', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load friends feed (${response.status})`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        setFeedItems([]);
        setError(null);
      } else {
        setFeedItems(data.items);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feed');
      setFeedItems([]);
    } finally {
      setLoading(false);
   }
 };

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // First, sync other users' listening history from Spotify
      try {
        await fetch('/api/sync-friends-history', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        console.error('Error syncing friends listening history:', err);
      }

      // Then fetch the updated feed with new data
      await fetchFeed();
      setLastRefreshTime(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial fetch and setup auto-refresh for now playing
  useEffect(() => {
    fetchFeed();
    fetchNowPlaying();

    // Set up auto-refresh for now playing every 5 seconds
    nowPlayingIntervalRef.current = setInterval(() => {
      fetchNowPlaying();
    }, 5000);

    // Check every 5 minutes if we should suggest a refresh
    refreshCheckIntervalRef.current = setInterval(() => {
      const timeSinceRefresh = Date.now() - lastRefreshTime.getTime();
      const FIVE_MINUTES = 5 * 60 * 1000;
      if (timeSinceRefresh >= FIVE_MINUTES) {
        setShowRefreshAlert(true);
        // Auto-hide the alert after 5 seconds
        if (alertTimeoutRef.current) {
          clearTimeout(alertTimeoutRef.current);
        }
        alertTimeoutRef.current = setTimeout(() => {
          setShowRefreshAlert(false);
        }, 5000);
      }
    }, 60000); // Check every minute

    return () => {
      if (nowPlayingIntervalRef.current) {
        clearInterval(nowPlayingIntervalRef.current);
      }
      if (refreshCheckIntervalRef.current) {
        clearInterval(refreshCheckIntervalRef.current);
      }
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, [lastRefreshTime]);

   // Cleanup on unmount
   useEffect(() => {
     return () => {
       if (transitionTimeoutRef.current) {
         clearTimeout(transitionTimeoutRef.current);
       }
       if (audioRef.current) {
         audioRef.current.pause();
       }
     };
   }, []);

   // Setup audio event listeners
   useEffect(() => {
     const audioElement = audioRef.current;
     if (!audioElement) return;

     const handleEnded = () => {
       setIsPlayingPreview(false);
     };

     audioElement.addEventListener('ended', handleEnded);
     return () => {
       audioElement.removeEventListener('ended', handleEnded);
     };
   }, []);

   // Handle scroll wheel
   useEffect(() => {
     const displayItems: FeedItem[] = [];

     if (nowPlayingTrack?.isPlaying && nowPlayingTrack.item) {
       const nowPlayingItem: FeedItem = {
         id: -1,
         spotifyTrackId: nowPlayingTrack.item.id,
         trackName: nowPlayingTrack.item.name,
         artistNames: nowPlayingTrack.item.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
         albumImageUrl: nowPlayingTrack.item.album?.images?.[0]?.url || '',
         playedAt: new Date().toISOString(),
         isNowPlaying: true,
         user: {
           id: 0,
           spotifyId: 'self',
           displayName: 'Now Playing',
           profileImageUrl: ''
         }
       };
       displayItems.push(nowPlayingItem);
     }

     displayItems.push(...feedItems);

     const handleWheel = (e: WheelEvent) => {
       if (isTransitioning || displayItems.length === 0) return;

       e.preventDefault();

       if (e.deltaY > 0) {
         // Scrolling down - next song
         handleNext();
       } else {
         // Scrolling up - previous song
         handlePrev();
       }
     };

     window.addEventListener('wheel', handleWheel, { passive: false });
     return () => window.removeEventListener('wheel', handleWheel);
   }, [isTransitioning, feedItems.length, nowPlayingTrack]);

   // Handle touch swipe
   const handleTouchStart = (e: React.TouchEvent) => {
     touchStartY.current = e.changedTouches[0].screenY;
   };

   const handleTouchEnd = (e: React.TouchEvent) => {
     const displayItems = buildDisplayItems();
     if (isTransitioning || displayItems.length === 0) return;

     touchEndY.current = e.changedTouches[0].screenY;
     const difference = touchStartY.current - touchEndY.current;

     // Require at least 30px swipe to trigger
     if (Math.abs(difference) > 30) {
       if (difference > 0) {
         // Swiped up (finger moved up) - next song
         handleNext();
       } else {
         // Swiped down (finger moved down) - previous song
         handlePrev();
       }
     }
   };

  const buildDisplayItems = (): FeedItem[] => {
    const items: FeedItem[] = [];

    // Add own now playing track
    if (nowPlayingTrack?.isPlaying && nowPlayingTrack.item) {
      const nowPlayingItem: FeedItem = {
        id: -1,
        spotifyTrackId: nowPlayingTrack.item.id,
        trackName: nowPlayingTrack.item.name,
        artistNames: nowPlayingTrack.item.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
        albumImageUrl: nowPlayingTrack.item.album?.images?.[0]?.url || '',
        playedAt: new Date().toISOString(),
        isNowPlaying: true,
        user: {
          id: 0,
          spotifyId: 'self',
          displayName: 'You',
          profileImageUrl: ''
        }
      };
      items.push(nowPlayingItem);
    }

    // Add feed items (which includes other users' now playing and listening history)
    items.push(...feedItems);
    return items;
  };

    const handleNext = () => {
      const displayItems = buildDisplayItems();
      if (!isTransitioning && displayItems.length > 0) {
        setIsTransitioning(true);

        // Stop preview playback
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlayingPreview(false);
        setPreviewUrl(null);

        // Clear any existing timeout
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }

        // Wait for fade out, then change content, then fade in
        transitionTimeoutRef.current = setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % displayItems.length);
          setIsTransitioning(false);
        }, 300);
      }
    };

    const handlePrev = () => {
      const displayItems = buildDisplayItems();
      if (!isTransitioning && displayItems.length > 0) {
        setIsTransitioning(true);

        // Stop preview playback
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlayingPreview(false);
        setPreviewUrl(null);

        // Clear any existing timeout
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }

        // Wait for fade out, then change content, then fade in
        transitionTimeoutRef.current = setTimeout(() => {
          setCurrentIndex((prev) => (prev - 1 + displayItems.length) % displayItems.length);
          setIsTransitioning(false);
        }, 300);
      }
    };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="text-2xl font-bold mb-4">Loading Friends Feed...</div>
          <div className="animate-spin">
            <ion-icon name="musical-notes" style={{ fontSize: '48px' }}></ion-icon>
          </div>
        </div>
      </div>
    );
  }

   if (error) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-gray-900">
         <div className="text-white text-center">
           <div className="text-2xl font-bold mb-4 text-red-500">Error</div>
           <div className="text-gray-300 mb-8">{error}</div>
           <Link href="/" className="px-6 py-3 bg-green-500 text-black font-bold rounded-full hover:bg-green-400">
             Back to Home
           </Link>
         </div>
       </div>
     );
   }

   const displayItems = buildDisplayItems();

   if (displayItems.length === 0) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-gray-900">
         <div className="text-white text-center">
           <div className="text-2xl font-bold mb-4">No Listening History Yet</div>
           <div className="text-gray-300 mb-8">Check back later for friends' listening activity</div>
           <Link href="/" className="px-6 py-3 bg-green-500 text-black font-bold rounded-full hover:bg-green-400">
             Back to Home
           </Link>
         </div>
       </div>
     );
   }

   const currentItem = displayItems[currentIndex];
   const spotifyUrl = `https://open.spotify.com/track/${currentItem.spotifyTrackId}`;

    return (
      <div
        className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black p-4 pt-6 md:pt-24 pb-24 md:pb-8 overflow-hidden fixed inset-0"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
       {/* Audio element for preview playback */}
       <audio
         ref={audioRef}
         crossOrigin="anonymous"
       />
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-white hover:text-gray-300 transition">
          <ion-icon name="chevron-back" style={{ fontSize: '28px' }}></ion-icon>
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-white">Friends Feed</h1>
        <div className="relative">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`transition ${
              isRefreshing
                ? 'text-gray-500 cursor-not-allowed'
                : 'text-white hover:text-green-400 cursor-pointer'
            }`}
            title="Refresh feed"
          >
            <ion-icon 
              name="refresh" 
              style={{ fontSize: '28px' }}
              className={isRefreshing ? 'animate-spin' : ''}
            ></ion-icon>
          </button>

          {/* Refresh Alert */}
          {showRefreshAlert && (
            <div className="absolute top-12 right-0 bg-yellow-500 text-black px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap animate-bounce">
              Feed is ready to refresh!
            </div>
          )}
        </div>
      </div>

       {/* Main Feed Card */}
       <div
         className={`flex flex-col items-center justify-center gap-4 md:gap-6 min-h-[calc(100vh-300px)] md:min-h-[calc(100vh-200px)] transition-opacity duration-300 ease-in-out ${
           isTransitioning ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
         }`}
       >
         {/* Now Playing Badge */}
         {currentItem.isNowPlaying && (
           <div className="mb-2 px-4 py-2 bg-green-500 text-black font-bold rounded-full flex items-center gap-2 text-sm md:text-base animate-pulse">
             <ion-icon name="play-circle" style={{ fontSize: '16px' }}></ion-icon>
             NOW PLAYING
           </div>
         )}

         {/* Album Art with fade */}
         <div className="relative">
           <div className={`rounded-2xl overflow-hidden shadow-2xl ${currentItem.isNowPlaying ? 'w-56 h-56 md:w-96 md:h-96 ring-4 ring-green-500' : 'w-48 h-48 md:w-80 md:h-80'}`}>
             {currentItem.albumImageUrl ? (
               <img
                 src={currentItem.albumImageUrl}
                 alt={currentItem.trackName}
                 className="w-full h-full object-cover"
               />
             ) : (
               <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                 <ion-icon name="musical-notes" style={{ fontSize: '60px', color: '#9CA3AF' }}></ion-icon>
               </div>
             )}
           </div>
         </div>

        {/* User Info */}
        {currentItem.user.spotifyId === 'self' ? (
          <div className="text-center">
            <p className="text-white font-bold text-sm md:text-lg">Your Music</p>
            <p className="text-gray-400 text-xs md:text-sm">Now Playing</p>
          </div>
        ) : (
          <Link href={`/users/${currentItem.user.id}`}>
            <div className="text-center cursor-pointer hover:opacity-80 transition">
              <div className="flex justify-center mb-2">
                <img
                  src={currentItem.user.profileImageUrl || '/default-avatar.png'}
                  alt={currentItem.user.displayName}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-green-500"
                />
              </div>
              <p className="text-white font-bold text-sm md:text-lg">{currentItem.user.displayName}</p>
              <p className="text-gray-400 text-xs md:text-sm">
                {currentItem.isNowPlaying ? 'Now Playing' : 'Listened on'} {new Date(currentItem.playedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: new Date(currentItem.playedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </Link>
        )}

        {/* Track Info */}
        <div className="text-center max-w-xs md:max-w-md">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 line-clamp-2">{currentItem.trackName}</h2>
          <p className="text-gray-300 text-lg md:text-xl line-clamp-2">{currentItem.artistNames}</p>
        </div>

         {/* Preview Player Button */}
         <button
           onClick={handlePlayPreview}
           disabled={previewLoading}
           className={`px-4 md:px-6 py-2 md:py-3 font-bold rounded-full transition flex items-center gap-2 text-sm md:text-base ${
             previewLoading
               ? 'bg-gray-500 text-black cursor-not-allowed'
               : isPlayingPreview
               ? 'bg-blue-500 text-white hover:bg-blue-400'
               : 'bg-purple-500 text-white hover:bg-purple-400'
           }`}
           title="Play preview"
         >
           <ion-icon 
             name={isPlayingPreview ? 'pause' : 'play'} 
             style={{ fontSize: '18px' }}
           ></ion-icon>
           {previewLoading ? 'Loading...' : isPlayingPreview ? 'Pause Preview' : 'Play Preview'}
         </button>

         {/* Listen on Spotify Button */}
         <a
           href={spotifyUrl}
           target="_blank"
           rel="noopener noreferrer"
           className="px-4 md:px-6 py-2 md:py-3 bg-green-500 text-black font-bold rounded-full hover:bg-green-400 transition flex items-center gap-2 text-sm md:text-base"
         >
           <ion-icon name="logo-spotify" style={{ fontSize: '18px' }}></ion-icon>
           Listen on Spotify
         </a>

        {/* Song Counter */}
        <div className="text-center mt-2 md:mt-4">
          <p className="text-gray-400 text-xs md:text-sm">{currentItem.isNowPlaying ? '🎵 Now Playing' : '📝 History'}</p>
          <p className="text-white text-xl md:text-2xl font-bold">
            {currentIndex + 1} / {displayItems.length}
          </p>
        </div>

         {/* Progress Bar */}
         <div className="w-full max-w-xs md:max-w-md h-2 bg-gray-700 rounded-full overflow-hidden mt-2 md:mt-4">
           <div
             className={`h-full transition-all duration-300 ${currentItem.isNowPlaying ? 'bg-green-400' : 'bg-green-500'}`}
             style={{ width: `${((currentIndex + 1) / displayItems.length) * 100}%` }}
           ></div>
         </div>

        {/* Scroll Hint */}
        <div className="text-gray-400 text-xs md:text-sm mt-6 md:mt-8 animate-bounce">
          <p>Scroll to navigate</p>
        </div>
      </div>
    </div>
  );
}

