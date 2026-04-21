'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface User {
  id: number;
  spotifyId: string;
  displayName: string;
  profileImageUrl: string | null;
  email: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto pt-4 md:pt-24 pb-20 md:pb-8">
      <div className="mb-8">
        <Link
          href="/"
          className="text-green-500 hover:text-green-600 font-medium"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-8">Spotify Users</h1>

      {users.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No users found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/users/${user.id}`}
              className="block p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-green-500 dark:hover:border-green-500 hover:shadow-lg transition"
            >
              <div className="flex items-center gap-4">
                {user.profileImageUrl && (
                  <img
                    src={user.profileImageUrl}
                    alt={user.displayName || 'User'}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold truncate">{user.displayName || 'Unknown'}</h2>
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

