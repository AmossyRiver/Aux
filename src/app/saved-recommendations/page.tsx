'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { IoPlayCircle, IoPauseCircle, IoTrash } from 'react-icons/io5';

interface SavedRecommendation {
  id: number;
  spotifyId: string;
  name: string;
  type: 'track' | 'artist';
  artistNames?: string;
  albumImageUrl?: string;
  genres?: string[];
  previewUrl?: string;
  popularity?: number;
  savedAt: string;
}

export default function SavedRecommendationsPage() {
  const [savedRecommendations, setSavedRecommendations] = useState<SavedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tracks' | 'artists'>('tracks');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchSavedRecommendations();
  }, []);

  const fetchSavedRecommendations = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/saved-recommendations');
      if (res.ok) {
        const data = await res.json();
        setSavedRecommendations(data.items || []);
      }
    } catch (error) {
      console.error('Error fetching saved recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecommendation = async (spotifyId: string, type: 'track' | 'artist') => {
    try {
      const res = await fetch('/api/saved-recommendations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyId, type })
      });

      if (res.ok) {
        setSavedRecommendations(prev =>
          prev.filter(item => !(item.spotifyId === spotifyId && item.type === type))
        );
      }
    } catch (error) {
      console.error('Error deleting recommendation:', error);
    }
  };

  const playPreview = async (track: SavedRecommendation) => {
    if (playingTrackId === track.spotifyId) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
      return;
    }

    if (!track.previewUrl) {
      // Try to get enhanced preview
      try {
        const params = new URLSearchParams({
          songName: track.name,
          artistName: track.artistNames?.split(',')[0] || 'Unknown',
          trackId: track.spotifyId
        });
        const res = await fetch(`/api/enhanced-preview?${params}`);
        const data = await res.json();
        if (data.previewUrl) {
          playAudio(data.previewUrl, track.spotifyId);
          return;
        }
      } catch (err) {
        console.error('Error fetching enhanced preview:', err);
      }
      alert('Preview not available for this track');
      return;
    }

    playAudio(track.previewUrl, track.spotifyId);
  };

  const playAudio = (url: string, trackId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(err => {
      console.error('Error playing preview:', err);
      alert('Failed to play preview');
    });
    audioRef.current.onended = () => setPlayingTrackId(null);
    setPlayingTrackId(trackId);
  };

  const savedTracks = savedRecommendations.filter(item => item.type === 'track');
  const savedArtists = savedRecommendations.filter(item => item.type === 'artist');

  if (loading) {
    return (
      <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
        <div className="flex items-center justify-center min-h-screen">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
      />

      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/recommendations"
          className="text-green-500 hover:text-green-600 font-medium"
        >
          ← Back
        </Link>
        <h1 className="text-3xl font-bold">Saved Recommendations</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('tracks')}
          className={`px-6 py-3 font-medium transition ${
            activeTab === 'tracks'
              ? 'text-green-500 border-b-2 border-green-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Saved Tracks ({savedTracks.length})
        </button>
        <button
          onClick={() => setActiveTab('artists')}
          className={`px-6 py-3 font-medium transition ${
            activeTab === 'artists'
              ? 'text-green-500 border-b-2 border-green-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Saved Artists ({savedArtists.length})
        </button>
      </div>

      {/* Tracks Tab */}
      {activeTab === 'tracks' && (
        <div>
          {savedTracks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">No saved tracks yet</p>
              <p className="text-gray-500 mb-6">Save recommendations from the recommendations page to see them here</p>
              <Link
                href="/recommendations"
                className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 inline-block"
              >
                Go to Recommendations
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {savedTracks.map((track) => (
                <li
                  key={`${track.spotifyId}-track`}
                  className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <button
                    onClick={() => playPreview(track)}
                    disabled={!track.previewUrl}
                    className={`w-12 h-12 flex items-center justify-center rounded-full text-white flex-shrink-0 transition ${
                      track.previewUrl
                        ? 'bg-green-500 hover:bg-green-600 cursor-pointer'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                    title={track.previewUrl ? 'Play preview' : 'No preview available'}
                  >
                    {playingTrackId === track.spotifyId ? (
                      <IoPauseCircle style={{ fontSize: '32px' }} />
                    ) : (
                      <IoPlayCircle style={{ fontSize: '32px' }} />
                    )}
                  </button>
                  <img
                    src={track.albumImageUrl}
                    alt=""
                    className="w-12 h-12 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.name}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {track.artistNames}
                    </p>
                  </div>
                  <a
                    href={`https://open.spotify.com/track/${track.spotifyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-full hover:bg-green-600 transition flex-shrink-0"
                  >
                    Listen
                  </a>
                  <button
                    onClick={() => deleteRecommendation(track.spotifyId, 'track')}
                    className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-full hover:bg-red-600 transition flex-shrink-0"
                    title="Remove from saved"
                  >
                    <IoTrash style={{ fontSize: '16px' }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Artists Tab */}
      {activeTab === 'artists' && (
        <div>
          {savedArtists.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">No saved artists yet</p>
              <p className="text-gray-500 mb-6">Save recommendations from the recommendations page to see them here</p>
              <Link
                href="/recommendations"
                className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 inline-block"
              >
                Go to Recommendations
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {savedArtists.map((artist) => (
                <div
                  key={`${artist.spotifyId}-artist`}
                  className="text-center relative group"
                >
                  <a
                    href={`https://open.spotify.com/artist/${artist.spotifyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="relative mb-4 overflow-hidden rounded-full">
                      <img
                        src={artist.albumImageUrl}
                        alt={artist.name}
                        className="w-full aspect-square rounded-full object-cover group-hover:opacity-80 transition"
                      />
                    </div>
                    <p className="font-medium truncate group-hover:text-green-500 transition">{artist.name}</p>
                    {artist.genres && artist.genres.length > 0 && (
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {artist.genres.slice(0, 2).join(', ')}
                      </p>
                    )}
                  </a>
                  <button
                    onClick={() => deleteRecommendation(artist.spotifyId, 'artist')}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                    title="Remove from saved"
                  >
                    <IoTrash style={{ fontSize: '16px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

