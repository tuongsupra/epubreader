import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import { getBookFile } from '../services/bookStorage';
import { useSettingsStore } from '../store/settingsStore';
import { syncProgress, getProgress } from '../services/syncService';
import { ArrowLeft, Settings, ChevronLeft, ChevronRight, Menu, List } from 'lucide-react';
import { useGesture } from '@use-gesture/react';
import clsx from 'clsx';

const Reader = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    // UI State
    const [showControls, setShowControls] = useState(false);
    const showControlsRef = useRef(false);
    const lastClickRef = useRef(0); // For double tap detection

    useEffect(() => { showControlsRef.current = showControls; }, [showControls]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toc, setToc] = useState([]);
    const [showToc, setShowToc] = useState(false);
    const [currentCfi, setCurrentCfi] = useState('');
    const [progress, setProgress] = useState(0);
    const [isLocationsReady, setIsLocationsReady] = useState(false);
    const [chapterTitle, setChapterTitle] = useState('');

    // Store
    const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useSettingsStore();

    useEffect(() => {
        if (!fontFamily) setFontFamily('Georgia');
    }, []);

    useEffect(() => {
        loadBook();
        return () => {
            if (bookRef.current) bookRef.current.destroy();
        };
    }, [id]);

    useEffect(() => {
        if (renditionRef.current) applyStyles();
    }, [theme, fontSize, fontFamily]);

    const applyStyles = () => {
        const rendition = renditionRef.current;
        if (!rendition) return;

        const themeColors = {
            light: { body: { color: '#000', background: '#fff' } },
            dark: { body: { color: '#d1d5db', background: '#111827' } },
            sepia: { body: { color: '#5f4b32', background: '#f6e5cb' } },
            'eye-care': { body: { color: '#333', background: '#cce8cf' } },
        };

        rendition.themes.register('light', themeColors.light);
        rendition.themes.register('dark', themeColors.dark);
        rendition.themes.register('sepia', themeColors.sepia);
        rendition.themes.register('eye-care', themeColors['eye-care']);

        rendition.themes.select(theme);
        rendition.themes.fontSize(`${fontSize}%`);
        rendition.themes.font(fontFamily);
    };

    const loadBook = async () => {
        try {
            const file = await getBookFile(id);
            if (!file) throw new Error("Book not found");

            const buffer = await file.arrayBuffer();
            const book = ePub(buffer);
            bookRef.current = book;

            const rendition = book.renderTo(viewerRef.current, {
                width: '100%',
                height: '100%',
                flow: 'paginated',
                manager: 'default',
                spread: 'none',
                minSpreadWidth: 10000
            });
            renditionRef.current = rendition;

            // Restore Progress
            const remoteData = await getProgress(id);
            const targetCfi = remoteData?.last_read_cfi || undefined;

            await rendition.display(targetCfi);
            applyStyles();
            setLoading(false);

            // Load TOC
            const navigation = await book.loaded.navigation;
            setToc(navigation.toc);

            // Generate Locations
            book.ready.then(() => {
                return book.locations.generate(1000);
            }).then(() => {
                setIsLocationsReady(true);
                const currentLoc = rendition.currentLocation();
                if (currentLoc && currentLoc.start) {
                    const pct = book.locations.percentageFromCfi(currentLoc.start.cfi);
                    setProgress(Math.floor(pct * 100));
                }
            });

            // Listeners
            rendition.on('relocated', (location) => {
                const cfi = location.start.cfi;
                setCurrentCfi(cfi);

                // Update Chapter Title
                // find chapter from toc
                // simplest is looking up href
                // A better way is using book.spine.get(cfi) label, but might be unreliable for custom epubs
                // We'll try to match href with TOC

                if (bookRef.current.locations.length() > 0) {
                    const percentage = bookRef.current.locations.percentageFromCfi(cfi);
                    setProgress(Math.floor(percentage * 100));

                    if (bookRef.current.package) {
                        const title = bookRef.current.package.metadata.title;
                        syncProgress(id, title, cfi, percentage);
                    }
                } else {
                    if (bookRef.current.package) {
                        const title = bookRef.current.package.metadata.title;
                        syncProgress(id, title, cfi, 0);
                    }
                }
            });

            // Handle Interactions (Click/Tap & Swipe inside Rendition)
            // Note: rendition events are reliable for content interaction
            let touchStartX = 0;
            let touchStartY = 0;

            rendition.on('touchstart', (e) => {
                touchStartX = e.changedTouches[0].clientX;
                touchStartY = e.changedTouches[0].clientY;
            });

            rendition.on('touchend', (e) => {
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;

                const diffX = touchStartX - touchEndX;
                const diffY = touchStartY - touchEndY;

                // Detect Horizontal Swipe (threshold 50px)
                if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) nextPage(); // Swipe Left -> Next
                    else prevPage();           // Swipe Right -> Prev
                    e.preventDefault();
                    return;
                }
            });

            rendition.on('click', (e) => {
                const now = Date.now();
                const timeDiff = now - lastClickRef.current;

                // Double Tap Detection (<300ms)
                if (timeDiff < 300 && timeDiff > 0) {
                    setShowControls(!showControlsRef.current);
                    lastClickRef.current = 0; // reset
                    return;
                }
                lastClickRef.current = now;

                // Wait a bit to check if it's a single click (Nav) or double click
                // But for responsiveness, we execute Nav immediately. 
                // Double click will toggle controls which is fine.

                const width = window.innerWidth;
                const height = window.innerHeight;
                const x = e.clientX;
                const y = e.clientY;

                if (showControlsRef.current) {
                    setShowControls(false); // Tap anywhere to hide if open
                    return;
                }

                // Zones
                // 1. Left 20% -> Prev
                if (x < width * 0.2) {
                    prevPage();
                    return;
                }
                // 2. Right 20% -> Next
                if (x > width * 0.8) {
                    nextPage();
                    return;
                }
                // 3. Bottom 30% -> Next
                if (y > height * 0.7) {
                    nextPage();
                    return;
                }

                // Center -> Do nothing (wait for potential double tap)
            });

        } catch (err) {
            console.error(err);
            setError(err.message);
            setLoading(false);
        }
    };

    const prevPage = () => renditionRef.current?.prev();
    const nextPage = () => renditionRef.current?.next();

    // Swipe handler for container (empty space outside iframe)
    const bind = useGesture({
        onDragEnd: ({ movement: [mx], velocity: [vx] }) => {
            if (mx > 50 && vx > 0.1) prevPage();
            if (mx < -50 && vx > 0.1) nextPage();
        }
    });

    const [showSettings, setShowSettings] = useState(false);

    if (error) return <div className="p-10 text-center text-red-500">Error: {error}</div>;

    const bgClass = theme === 'dark' ? 'bg-slate-900' : theme === 'sepia' ? 'bg-[#F6E5CB]' : theme === 'eye-care' ? 'bg-[#cce8cf]' : 'bg-white';
    const textClass = theme === 'dark' ? 'text-gray-300' : theme === 'sepia' ? 'text-[#5F4B32]' : theme === 'eye-care' ? 'text-[#333]' : 'text-gray-800';

    return (
        <div className={clsx("relative w-full h-dvh overflow-hidden flex flex-col", bgClass)} {...bind()}>
            {/* Header Overlay */}
            <header className={clsx(
                "fixed top-0 left-0 right-0 z-50 transition-transform duration-300 p-4 flex justify-between items-center bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-sm",
                showControls ? "translate-y-0" : "-translate-y-full"
            )}>
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/library')} className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10", textClass)}>
                        <ArrowLeft size={24} />
                    </button>
                    <button onClick={() => setShowToc(!showToc)} className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10", textClass)}>
                        <List size={24} />
                    </button>
                </div>

                <h2 className={clsx("font-semibold truncate max-w-[50%] text-sm", textClass)}>Reader</h2>

                <div className="relative">
                    <button onClick={() => setShowSettings(!showSettings)} className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10", textClass)}>
                        <Settings size={24} />
                    </button>
                    {/* Settings Dropdown */}
                    {showSettings && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50 text-gray-900 dark:text-gray-100">
                            <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-gray-500">Theme</h3>
                            <div className="flex gap-2 mb-4">
                                <button onClick={() => setTheme('light')} className={clsx("flex-1 py-1 rounded border", theme === 'light' ? "border-indigo-500 ring-1" : "border-gray-300 dark:border-gray-600")}>Light</button>
                                <button onClick={() => setTheme('sepia')} className={clsx("flex-1 py-1 rounded border bg-[#f6e5cb] text-[#5f4b32]", theme === 'sepia' ? "border-indigo-500 ring-1" : "border-gray-300 dark:border-gray-600")}>Sepia</button>
                                <button onClick={() => setTheme('dark')} className={clsx("flex-1 py-1 rounded border bg-gray-900 text-gray-100", theme === 'dark' ? "border-indigo-500 ring-1" : "border-gray-300 dark:border-gray-600")}>Dark</button>
                                <button onClick={() => setTheme('eye-care')} className={clsx("flex-1 py-1 rounded border bg-[#cce8cf] text-[#333]", theme === 'eye-care' ? "border-indigo-500 ring-1" : "border-gray-300 dark:border-gray-600")}>Green</button>
                            </div>
                            <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-gray-500">Typography</h3>
                            <div className="mb-4 flex items-center gap-2">
                                <button onClick={() => setFontSize(Math.max(50, fontSize - 10))} className="p-1 bg-gray-100 dark:bg-gray-700 rounded">A-</button>
                                <span className="flex-1 text-center text-sm">{fontSize}%</span>
                                <button onClick={() => setFontSize(Math.min(300, fontSize + 10))} className="p-1 bg-gray-100 dark:bg-gray-700 rounded">A+</button>
                            </div>
                            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent">
                                <option value="Georgia">Georgia (Serif)</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Inter">Inter (Sans)</option>
                                <option value="Arial">Arial</option>
                            </select>
                        </div>
                    )}
                </div>
            </header>

            {/* TOC Drawer */}
            {showToc && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowToc(false)} />
                    <div className="relative w-3/4 max-w-xs bg-white dark:bg-gray-800 h-full overflow-y-auto p-4 shadow-xl">
                        <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">Table of Contents</h3>
                        <div className="space-y-2">
                            {toc.map((item, idx) => {
                                const isActive = currentCfi && item.href && currentCfi.includes(item.href.split('#')[0]);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => { renditionRef.current.display(item.href); setShowToc(false); }}
                                        className={clsx("block w-full text-left p-2 rounded text-sm truncate",
                                            isActive ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Viewer */}
            <div className="flex-1 w-full h-full z-0 px-2 sm:px-8 pt-10 pb-12" ref={viewerRef} />

            {/* Persistent Footer Info */}
            <div className={clsx("absolute bottom-0 left-0 right-0 h-6 px-4 flex justify-between items-center text-[10px] opacity-70 bg-transparent z-40 select-none pointer-events-none", textClass)}>
                <span className="truncate max-w-[70%]">Book Reading...</span>
                <span>{isLocationsReady ? `${progress}%` : '--%'}</span>
            </div>

            {/* Footer Overlay */}
            <footer className={clsx(
                "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 flex flex-col bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-[0_-1px_10px_rgba(0,0,0,0.1)] pb-4",
                showControls ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="px-6 pt-4 pb-2">
                    <input
                        type="range" min="0" max="100" value={progress}
                        disabled={!isLocationsReady}
                        onChange={(e) => {
                            const val = e.target.value;
                            setProgress(val);
                            if (bookRef.current && isLocationsReady) {
                                const cfi = bookRef.current.locations.cfiFromPercentage(val / 100);
                                renditionRef.current.display(cfi);
                            }
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600 disabled:opacity-50"
                    />
                </div>

                <div className={clsx("flex justify-between items-center px-6 py-2", textClass)}>
                    <button onClick={prevPage} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeft size={28} /></button>
                    <button onClick={() => setShowSettings(!showSettings)} className="flex flex-col items-center gap-1 group">
                        <span className="font-serif text-lg leading-none">Aa</span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-indigo-500">Text</span>
                    </button>
                    <button onClick={nextPage} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ChevronRight size={28} /></button>
                </div>
            </footer>

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
            )}
        </div>
    );
};

export default Reader;
