'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { IoPlayCircle, IoPauseCircle } from 'react-icons/io5';

interface SpotifyUser {
  display_name: string;
  images: { url: string }[];
  email: string;
}

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

type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export default function Home() {
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [topTracks, setTopTracks] = useState<Record<TimeRange, Track[]>>({
    short_term: [],
    medium_term: [],
    long_term: []
  });
  const [topArtists, setTopArtists] = useState<Record<TimeRange, Artist[]>>({
    short_term: [],
    medium_term: [],
    long_term: []
  });
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryTrack[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('medium_term');
  const [nowPlaying, setNowPlaying] = useState<{ isPlaying: boolean; item?: Track } | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nowPlayingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Auto-refresh now playing every 5 seconds
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const playingRes = await fetch('/api/now-playing');
        if (playingRes.ok) {
          setNowPlaying(await playingRes.json());
        }
      } catch (error) {
        console.error('Error fetching now playing:', error);
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
  }, []);

  async function fetchUserData() {
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const userData = await meRes.json();
        setUser(userData);

        const timeRanges: TimeRange[] = ['short_term', 'medium_term', 'long_term'];
        const tracksData: Record<TimeRange, Track[]> = {
          short_term: [],
          medium_term: [],
          long_term: []
        };
        const artistsData: Record<TimeRange, Artist[]> = {
          short_term: [],
          medium_term: [],
          long_term: []
        };

        // Fetch data for all time ranges
        await Promise.all(
          timeRanges.map(async (timeRange) => {
            const [tracksRes, artistsRes] = await Promise.all([
              fetch(`/api/top-tracks?timeRange=${timeRange}`),
              fetch(`/api/top-artists?timeRange=${timeRange}`)
            ]);

            if (tracksRes.ok) {
              const data = await tracksRes.json();
              tracksData[timeRange] = data.items || [];
            }
            if (artistsRes.ok) {
              const data = await artistsRes.json();
              artistsData[timeRange] = data.items || [];
            }
          })
        );

        setTopTracks(tracksData);
        setTopArtists(artistsData);


        // Fetch listening history
        const historyRes = await fetch('/api/recently-played?limit=50');
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setListeningHistory(historyData.items || []);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
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
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <h1 className="text-3xl font-bold">Spotify Dashboard</h1>
          <a
              href="/api/login"
              className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600"
          >
            Login with Spotify
          </a>
        </div>
    );
  }

  return (
      <main className="min-h-screen p-4 md:p-8 max-w-4xl md:max-w-6xl lg:max-w-none lg:px-16 mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 md:gap-0">
          <div className="flex items-center gap-4">
            {user.images?.[0] && (
                <img src={user.images[0].url} alt="Profile" className="w-16 h-16 rounded-full" />
            )}
            <div>
              <h1 className="text-2xl font-bold">Welcome, {user.display_name}</h1>
              <p className="text-gray-500">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/recommendations"
              className="px-4 py-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition"
            >
              Discover
            </Link>
            <Link
              href="/saved-recommendations"
              className="px-4 py-2 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition"
            >
              Saved
            </Link>
            <Link
              href="/friends-feed"
              className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
            >
              Friends Feed
            </Link>
            <Link
              href="/users"
              className="px-4 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
            >
              Explore Users
            </Link>
          </div>
        </div>

        {nowPlaying?.isPlaying && nowPlaying.item && (
            <section className="mb-8 p-4 bg-green-100 dark:bg-green-900 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">Now Playing</h2>
              <p>{nowPlaying.item.name} - {nowPlaying.item.artists.map(a => a.name).join(', ')}</p>
            </section>
        )}

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Your Top Music</h2>
          
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

          <div className="grid grid-cols-1 gap-8 md:gap-16">
            {/* Top Artists */}
            <div>
              <h3 className="text-xl font-bold mb-4">Top Artists</h3>
              {/* Grid for small-md screens, flex for lg+ screens */}
              <div className="grid grid-cols-3 gap-4 lg:flex lg:gap-2 lg:overflow-visible">
                {topArtists[selectedTimeRange].map(artist => (
                    <div key={artist.id} className="text-center flex flex-col items-center lg:flex-1 lg:flex-shrink-0" style={{ width: '120px', height: 'auto' }}>
                      <div className="w-full h-auto aspect-square rounded-full overflow-hidden flex-shrink-0">
                        <img src={artist.images?.[0]?.url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <p className="mt-2 font-medium truncate text-sm w-full">{artist.name}</p>
                    </div>
                ))}
              </div>
            </div>

            {/* Top Tracks */}
            <div>
              <h3 className="text-xl font-bold mb-4">Top Tracks</h3>
              <ul className="space-y-2">
                {topTracks[selectedTimeRange].map((track, i) => (
                    <li key={track.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
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
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Recently Played</h2>
            <Link
              href="/listening-history"
              className="text-green-500 hover:text-green-600 font-medium text-sm"
            >
              View All →
            </Link>
          </div>
          <ul className="space-y-2">
            {listeningHistory.slice(0, 25).map((track, i) => (
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
