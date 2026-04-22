'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { IoPlayCircle, IoPauseCircle } from 'react-icons/io5';

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

interface ListeningHistoryTrack extends Track {
  timesPlayed: number;
  playedAt: string;
}

export default function ListeningHistoryPage() {
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchListeningHistory();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

   async function fetchListeningHistory() {
     try {
       setLoading(true);
       // Fetch directly from the database endpoint
       const res = await fetch('/api/listening-history');
        if (res.ok) {
          const data = await res.json();
          // Deduplicate on frontend to ensure no duplicates are shown
          const items = data.items || [];
          const deduped = Array.from(
            new Map(items.map((item: ListeningHistoryTrack) => [item.id, item])).values()
          ) as ListeningHistoryTrack[];
          setListeningHistory(deduped);
        } else {
          console.error('Failed to fetch listening history:', res.status);
        }
     } catch (error) {
       console.error('Error fetching listening history:', error);
     } finally {
       setLoading(false);
     }
   }

  async function playPreview(track: Track) {
    if (playingTrackId === track.id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
      return;
    }

    const params = new URLSearchParams({
      songName: track.name,
      artistName: track.artists[0].name,
      trackId: track.id
    });

    try {
      const res = await fetch(`/api/enhanced-preview?${params}`);
      const data = await res.json();

      if (data.previewUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(data.previewUrl);
        audioRef.current.play();
        audioRef.current.onended = () => setPlayingTrackId(null);
        setPlayingTrackId(track.id);
      } else {
        console.log('No preview available for this track');
      }
    } catch (error) {
      console.error('Failed to load preview:', error);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
        <div className="flex items-center justify-center min-h-screen">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/"
          className="text-green-500 hover:text-green-600 font-medium"
        >
          ← Back
        </Link>
        <h1 className="text-3xl font-bold">Listening History</h1>
      </div>

      <section>
        <p className="text-gray-500 mb-6">Showing {listeningHistory.length} tracks</p>
        <ul className="space-y-2">
          {listeningHistory.map((track, i) => (
            <li key={`${track.id}-${i}`} className="flex items-center gap-3 p-3 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              <button
                onClick={() => playPreview(track)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white flex-shrink-0"
              >
               {playingTrackId === track.id ? (
                   <IoPauseCircle style={{ fontSize: '28px' }} />
                 ) : (
                   <IoPlayCircle style={{ fontSize: '28px' }} />
                 )}
              </button>
              <img src={track.album.images?.[0]?.url} alt="" className="w-10 h-10 rounded" />
              <div className="flex-1">
                <p className="font-medium">{track.name}</p>
                <p className="text-sm text-gray-500">{track.artists.map(a => a.name).join(', ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  {new Date(track.playedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: new Date(track.playedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

