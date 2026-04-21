'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Track {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { images: { url: string }[] };
    preview_url?: string;
}

interface Artist {
    id: string;
    name: string;
    images: { url: string }[];
    genres: string[];
}

export default function RecommendationsPage() {
    const [activeTab, setActiveTab] = useState<'tracks' | 'artists'>('tracks');
    const [trackRecommendations, setTrackRecommendations] = useState<Track[]>([]);
    const [artistRecommendations, setArtistRecommendations] = useState<Artist[]>([]);
    const [topTracks, setTopTracks] = useState<Track[]>([]);
    const [topArtists, setTopArtists] = useState<Artist[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
    const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
    const [selectedTimeRange, setSelectedTimeRange] = useState<'short_term' | 'medium_term' | 'long_term'>('medium_term');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
    const [showSeedSelector, setShowSeedSelector] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoading(true);
                
                // Fetch available seeds (top tracks and artists) for the selected time range
                const seedsRes = await fetch(`/api/top-seeds?timeRange=${selectedTimeRange}`);
                if (seedsRes.status === 401) {
                    window.location.href = '/api/login';
                    return;
                }
                if (seedsRes.ok) {
                    const seedsData = await seedsRes.json();
                    setTopTracks(seedsData.topTracks || []);
                    setTopArtists(seedsData.topArtists || []);
                    // Clear selections when time range changes
                    setSelectedTracks(new Set());
                    setSelectedArtists(new Set());
                }

                setError(null);
            } catch (err) {
                console.error('[PAGE] Error fetching initial data:', err);
                setError(err instanceof Error ? err.message : 'Failed to load');
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, [selectedTimeRange]);

    const fetchRecommendations = async (selectedTrackIds?: string[], selectedArtistIds?: string[]) => {
        try {
            const tracksQuery = selectedTrackIds && selectedTrackIds.length > 0 
                ? `&tracks=${selectedTrackIds.join(',')}`
                : '';
            const artistsQuery = selectedArtistIds && selectedArtistIds.length > 0 
                ? `&artists=${selectedArtistIds.join(',')}`
                : '';
            
            const tracksRes = await fetch(`/api/recommendations?type=tracks${tracksQuery}${artistsQuery}`);
            if (tracksRes.status === 401) {
                window.location.href = '/api/login';
                return;
            }
             if (tracksRes.ok) {
                 const tracksData = await tracksRes.json();
                 console.log('[PAGE] Tracks response:', tracksData);
                 // Deduplicate tracks by ID
                 const deduplicatedTracks = Array.from(
                     new Map((tracksData.items || []).map((track: Track) => [track.id, track])).values()
                 );
                 setTrackRecommendations(deduplicatedTracks);
             }

             const artistsRes = await fetch(`/api/recommendations?type=artists${tracksQuery}${artistsQuery}`);
             if (artistsRes.status === 401) {
                 window.location.href = '/api/login';
                 return;
             }
             if (artistsRes.ok) {
                 const artistsData = await artistsRes.json();
                 console.log('[PAGE] Artists response:', artistsData);
                 // Deduplicate artists by ID
                 const deduplicatedArtists = Array.from(
                     new Map((artistsData.items || []).map((artist: Artist) => [artist.id, artist])).values()
                 );
                 setArtistRecommendations(deduplicatedArtists);
             }

            setError(null);
        } catch (err) {
            console.error('[PAGE] Error fetching recommendations:', err);
            setError(err instanceof Error ? err.message : 'Failed to load recommendations');
        }
    };

    const toggleTrackSelection = (trackId: string) => {
        const newSelected = new Set(selectedTracks);
        if (newSelected.has(trackId)) {
            newSelected.delete(trackId);
        } else {
            newSelected.add(trackId);
        }
        setSelectedTracks(newSelected);
    };

    const toggleArtistSelection = (artistId: string) => {
        const newSelected = new Set(selectedArtists);
        if (newSelected.has(artistId)) {
            newSelected.delete(artistId);
        } else {
            newSelected.add(artistId);
        }
        setSelectedArtists(newSelected);
    };

    const handleGenerateRecommendations = async () => {
        const selectedTrackIds = Array.from(selectedTracks);
        const selectedArtistIds = Array.from(selectedArtists);
        
        if (selectedTrackIds.length === 0 && selectedArtistIds.length === 0) {
            setError('Please select at least one track or artist');
            return;
        }
        
        setLoading(true);
        await fetchRecommendations(selectedTrackIds, selectedArtistIds);
        setLoading(false);
        setShowSeedSelector(false);
    };

    const playPreview = (track: Track) => {
        if (playingTrackId === track.id) {
            audioRef.current?.pause();
            setPlayingTrackId(null);
            return;
        }

        if (!track.preview_url) {
            alert('Preview not available for this track');
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
        }
        audioRef.current = new Audio(track.preview_url);
        audioRef.current.play().catch(err => {
            console.error('Error playing preview:', err);
            alert('Failed to play preview');
        });
        audioRef.current.onended = () => setPlayingTrackId(null);
        setPlayingTrackId(track.id);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="text-2xl font-bold mb-4">Loading Recommendations...</div>
                    <div className="animate-spin">
                        <ion-icon name="musical-notes" style={{ fontSize: '48px' }}></ion-icon>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="text-2xl font-bold mb-4 text-red-500">Error</div>
                    <div className="text-gray-500 mb-8">{error}</div>
                    <Link
                        href="/"
                        className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-4 md:p-8 max-w-4xl md:max-w-6xl lg:max-w-none lg:px-16 mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Recommended For You</h1>
                    <p className="text-gray-500 mt-2">Discover new music tailored to your taste</p>
                </div>
                <Link href="/" className="text-gray-500 hover:text-gray-300 transition">
                    <ion-icon name="chevron-back" style={{ fontSize: '32px' }}></ion-icon>
                </Link>
            </div>

            {/* Seed Selector Button */}
            <div className="mb-8">
                <button
                    onClick={() => setShowSeedSelector(!showSeedSelector)}
                    className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition font-medium"
                >
                    <ion-icon name="settings-outline" style={{ fontSize: '20px', marginRight: '8px' }}></ion-icon>
                    Customize Seeds
                </button>
                {(selectedTracks.size > 0 || selectedArtists.size > 0) && (
                    <span className="ml-4 text-gray-500">
                        {selectedTracks.size + selectedArtists.size} seed{selectedTracks.size + selectedArtists.size !== 1 ? 's' : ''} selected
                    </span>
                )}
            </div>

            {/* Seed Selector Modal */}
            {showSeedSelector && (
                <div className="mb-8 p-6 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-700">
                    <h2 className="text-xl font-bold mb-6">Select Recommendations Seeds</h2>
                    
                    {/* Time Range Selector */}
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Time Range</h3>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedTimeRange('short_term')}
                                className={`px-4 py-2 rounded-full font-medium transition ${
                                    selectedTimeRange === 'short_term'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                Last 4 Weeks
                            </button>
                            <button
                                onClick={() => setSelectedTimeRange('medium_term')}
                                className={`px-4 py-2 rounded-full font-medium transition ${
                                    selectedTimeRange === 'medium_term'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                Last 6 Months
                            </button>
                            <button
                                onClick={() => setSelectedTimeRange('long_term')}
                                className={`px-4 py-2 rounded-full font-medium transition ${
                                    selectedTimeRange === 'long_term'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                All Time
                            </button>
                        </div>
                    </div>
                    
                    {/* Tracks Section */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4">Your Top Tracks</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {topTracks.map((track) => (
                                <button
                                    key={track.id}
                                    onClick={() => toggleTrackSelection(track.id)}
                                    className={`p-4 rounded-lg transition text-left ${
                                        selectedTracks.has(track.id)
                                            ? 'bg-green-500 text-white ring-2 ring-green-600'
                                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={track.album.images?.[0]?.url}
                                            alt={track.name}
                                            className="w-10 h-10 rounded object-cover"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate text-sm">{track.name}</p>
                                            <p className="text-xs truncate opacity-75">
                                                {track.artists.map(a => a.name).join(', ')}
                                            </p>
                                        </div>
                                        {selectedTracks.has(track.id) && (
                                            <ion-icon name="checkmark-circle" style={{ fontSize: '20px' }}></ion-icon>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Artists Section */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4">Your Top Artists</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {topArtists.map((artist) => (
                                <button
                                    key={artist.id}
                                    onClick={() => toggleArtistSelection(artist.id)}
                                    className={`p-4 rounded-lg transition text-center ${
                                        selectedArtists.has(artist.id)
                                            ? 'bg-green-500 text-white ring-2 ring-green-600'
                                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <img
                                        src={artist.images?.[0]?.url}
                                        alt={artist.name}
                                        className="w-12 h-12 rounded-full mx-auto mb-2 object-cover"
                                    />
                                    <p className="font-medium truncate text-sm">{artist.name}</p>
                                    {selectedArtists.has(artist.id) && (
                                        <ion-icon name="checkmark-circle" style={{ fontSize: '20px', marginTop: '4px' }}></ion-icon>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleGenerateRecommendations}
                            disabled={selectedTracks.size === 0 && selectedArtists.size === 0}
                            className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Generate Recommendations
                        </button>
                        <button
                            onClick={() => setShowSeedSelector(false)}
                            className="px-6 py-3 bg-gray-400 text-white rounded-full hover:bg-gray-500 transition font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

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
                    Recommended Tracks
                </button>
                <button
                    onClick={() => setActiveTab('artists')}
                    className={`px-6 py-3 font-medium transition ${
                        activeTab === 'artists'
                            ? 'text-green-500 border-b-2 border-green-500'
                            : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Recommended Artists
                </button>
            </div>

            {/* Tracks Tab */}
            {activeTab === 'tracks' && (
                <div>
                    {trackRecommendations.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-gray-400 mb-4">No recommendations yet</p>
                            <p className="text-gray-500 mb-6">Click "Customize Seeds" above to select your favorite tracks or artists, then click "Generate Recommendations" to get started!</p>
                            <button
                                onClick={() => setShowSeedSelector(true)}
                                className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition font-medium"
                            >
                                <ion-icon name="settings-outline" style={{ fontSize: '20px', marginRight: '8px' }}></ion-icon>
                                Customize Seeds
                            </button>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {trackRecommendations.map((track) => (
                                <li
                                    key={track.id}
                                    className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    <button
                                        onClick={() => playPreview(track)}
                                        disabled={!track.preview_url}
                                        className={`w-12 h-12 flex items-center justify-center rounded-full text-white flex-shrink-0 transition ${
                                            track.preview_url
                                                ? 'bg-green-500 hover:bg-green-600 cursor-pointer'
                                                : 'bg-gray-400 cursor-not-allowed'
                                        }`}
                                        title={track.preview_url ? 'Play preview' : 'No preview available'}
                                    >
                                        {playingTrackId === track.id ? (
                                            <ion-icon name="pause-circle" style={{ fontSize: '32px' }}></ion-icon>
                                        ) : (
                                            <ion-icon name="play-circle" style={{ fontSize: '32px' }}></ion-icon>
                                        )}
                                    </button>
                                    <img
                                        src={track.album.images?.[0]?.url}
                                        alt=""
                                        className="w-12 h-12 rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{track.name}</p>
                                        <p className="text-sm text-gray-500 truncate">
                                            {track.artists.map((a) => a.name).join(', ')}
                                        </p>
                                    </div>
                                    <a
                                        href={`https://open.spotify.com/track/${track.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-full hover:bg-green-600 transition flex-shrink-0"
                                    >
                                        Listen
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Artists Tab */}
            {activeTab === 'artists' && (
                <div>
                    {artistRecommendations.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-gray-400 mb-4">No recommendations yet</p>
                            <p className="text-gray-500 mb-6">Click "Customize Seeds" above to select your favorite tracks or artists, then click "Generate Recommendations" to get started!</p>
                            <button
                                onClick={() => setShowSeedSelector(true)}
                                className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition font-medium"
                            >
                                <ion-icon name="settings-outline" style={{ fontSize: '20px', marginRight: '8px' }}></ion-icon>
                                Customize Seeds
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {artistRecommendations.map((artist) => (
                                <a
                                    key={artist.id}
                                    href={`https://open.spotify.com/artist/${artist.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group text-center cursor-pointer transition"
                                >
                                    <div className="relative mb-4 overflow-hidden rounded-full">
                                        <img
                                            src={artist.images?.[0]?.url}
                                            alt={artist.name}
                                            className="w-full aspect-square rounded-full object-cover group-hover:opacity-80 transition"
                                        />
                                    </div>
                                    <p className="font-medium truncate group-hover:text-green-500 transition">{artist.name}</p>
                                    {artist.genres.length > 0 && (
                                        <p className="text-xs text-gray-500 truncate mt-1">
                                            {artist.genres.slice(0, 2).join(', ')}
                                        </p>
                                    )}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}

