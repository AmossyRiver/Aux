'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

interface Artist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
}

interface ListeningHistoryTrack extends Track {
  timesPlayed: number;
  playedAt: string;
}

interface User {
  id: number;
  spotifyId: string;
  displayName: string;
  profileImageUrl: string | null;
  email: string | null;
  createdAt: string;
}

type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const [userId, setUserId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<{ isPlaying: boolean; item?: Track } | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('medium_term');
  const [loading, setLoading] = useState(true);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nowPlayingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unwrapParams = async () => {
      const { userId: userIdString } = await params;
      const parsedUserId = parseInt(userIdString);
      setUserId(parsedUserId);
    };
    unwrapParams();
  }, [params]);

  useEffect(() => {
    if (userId === null) return;
    fetchUserData();
  }, [selectedTimeRange, userId]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Auto-refresh now playing every 5 seconds
  useEffect(() => {
    if (userId === null) return;

    const fetchNowPlaying = async () => {
      try {
        const res = await fetch(`/api/users/${userId}/now-playing`);
        if (res.ok) {
          setNowPlaying(await res.json());
        }
      } catch (error) {
        console.error('Error fetching user now playing:', error);
      }
    };

    // Fetch immediately
    fetchNowPlaying();

    // Set up interval to refresh every 5 seconds
    nowPlayingIntervalRef.current = setInterval(fetchNowPlaying, 5000);

    return () => {
      if (nowPlayingIntervalRef.current) {
        clearInterval(nowPlayingIntervalRef.current);
      }
    };
  }, [userId]);

  async function fetchUserData() {
    if (userId === null) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}?timeRange=${selectedTimeRange}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setTopTracks(data.topTracks || []);
        setTopArtists(data.topArtists || []);
        setListeningHistory(data.listeningHistory || []);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <main className="min-h-screen p-8 max-w-4xl mx-auto">
        <Link
          href="/users"
          className="text-green-500 hover:text-green-600 font-medium"
        >
          ← Back to Users
        </Link>
        <p className="mt-8">User not found</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
      <Link
        href="/users"
        className="text-green-500 hover:text-green-600 font-medium"
      >
        ← Back to Users
      </Link>

      <div className="flex items-center gap-4 mb-8 mt-8">
        {user.profileImageUrl && (
          <img src={user.profileImageUrl} alt="Profile" className="w-16 h-16 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{user.displayName}</h1>
          <p className="text-gray-500">{user.email}</p>
        </div>
      </div>

      {nowPlaying?.isPlaying && nowPlaying.item && (
        <section className="mb-8 p-4 bg-green-100 dark:bg-green-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Now Playing</h2>
          <p className="text-gray-800 dark:text-gray-100">{nowPlaying.item.name} - {nowPlaying.item.artists.map((a: any) => a.name).join(', ')}</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Their Top Music</h2>
        
        <div className="flex gap-2 mb-6">
          {(['short_term', 'medium_term', 'long_term'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              className={`px-4 py-2 rounded-full font-medium transition ${
                selectedTimeRange === range
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {range === 'short_term' ? 'Last 4 Weeks' : range === 'medium_term' ? 'Last 6 Months' : 'All Time'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
          {/* Top Tracks */}
          <div>
            <h3 className="text-xl font-bold mb-4">Top Tracks</h3>
            <ul className="space-y-2">
              {topTracks.map((track, i) => (
                <li key={track.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                  <button
                    onClick={() => playPreview(track)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white flex-shrink-0"
                  >
                    {playingTrackId === track.id ? '⏸' : '▶'}
                  </button>
                  <span className="w-6 text-gray-500">{i + 1}</span>
                  <img src={track.album.images?.[0]?.url} alt="" className="w-10 h-10 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.name}</p>
                    <p className="text-sm text-gray-500 truncate">{track.artists.map(a => a.name).join(', ')}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Top Artists */}
          <div>
            <h3 className="text-xl font-bold mb-4">Top Artists</h3>
            <div className="grid grid-cols-3 gap-4">
              {topArtists.map(artist => (
                <div key={artist.id} className="text-center">
                  <img src={artist.images?.[0]?.url} alt="" className="w-full aspect-square rounded-full object-cover" />
                  <p className="mt-2 font-medium truncate text-sm">{artist.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold mb-4">Their Listening History</h2>
        <ul className="space-y-2">
          {listeningHistory.map((track, i) => (
            <li key={`${track.id}-${i}`} className="flex items-center gap-3 p-3 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              <button
                onClick={() => playPreview(track)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white flex-shrink-0"
              >
                {playingTrackId === track.id ? '⏸' : '▶'}
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

