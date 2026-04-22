'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IoHome, IoSparkles, IoMusicalNotes, IoPeople } from 'react-icons/io5';

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', icon: IoHome, label: 'Home' },
    { href: '/recommendations', icon: IoSparkles, label: 'Discover' },
    { href: '/friends-feed', icon: IoMusicalNotes, label: 'Feed' },
    { href: '/users', icon: IoPeople, label: 'Users' },
  ];

  return (
    <>
      {/* Bottom Navigation - Mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 md:hidden z-50">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const IconComponent = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition ${
                  isActive
                    ? 'text-green-500'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <IconComponent style={{ fontSize: '24px' }} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Top Navigation - Desktop only */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-white font-bold text-xl">
            Spotify Stats
          </Link>
          <div className="flex gap-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-full font-medium transition ${
                    isActive
                      ? 'bg-green-500 text-black'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

