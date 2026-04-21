import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { initializeCronJobs } from '@/lib/cron';
import BottomNav from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'] });

// Initialize cron jobs on app startup
initializeCronJobs();

export const metadata: Metadata = {
    title: 'Spotify Dashboard',
    description: 'Your personal Spotify statistics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
        <head>
            <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
            <script noModule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
        </head>
        <body className={inter.className}>
            <BottomNav />
            {children}
        </body>
        </html>
    );
}
