import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import { getBookFile } from '../services/bookStorage';
import { useSettingsStore } from '../store/settingsStore';
import { syncProgress, getProgress } from '../services/syncService';
import { ArrowLeft, Settings, ChevronLeft, ChevronRight, List, Maximize, Minimize, Type } from 'lucide-react';
import { useGesture } from '@use-gesture/react';
import clsx from 'clsx';

// Kindle-inspired theme definitions
const KINDLE_THEMES = {
    light: {
        body: { color: '#000000', background: '#FFFFFF' },
        text: 'text-gray-900',
        bg: 'bg-white',
        controlBg: 'bg-white/98',
        border: 'border-gray-200'
    },
    sepia: {
        body: { color: '#5B4636', background: '#F4E8D8' },
        text: 'text-[#5B4636]',
        bg: 'bg-[#F4E8D8]',
        controlBg: 'bg-[#F4E8D8]/98',
        border: 'border-[#D4C8B8]'
    },
    dark: {
        body: { color: '#E8E8E8', background: '#0F0F0F' },
        text: 'text-gray-200',
        bg: 'bg-[#0F0F0F]',
        controlBg: 'bg-[#0F0F0F]/98',
        border: 'border-gray-600'
    },
    'eye-care': {
        body: { color: '#1F2937', background: '#E0F0E3' },
        text: 'text-gray-800',
        bg: 'bg-[#E0F0E3]',
        controlBg: 'bg-[#E0F0E3]/98',
        border: 'border-[#C0D0C3]'
    },
};

const Reader = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    // UI State
    const [showControls, setShowControls] = useState(false);
    const showControlsRef = useRef(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => { showControlsRef.current = showControls; }, [showControls]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toc, setToc] = useState([]);
    const [showToc, setShowToc] = useState(false);

    // Metadata State
    const [bookTitle, setBookTitle] = useState('');
    const [chapterTitle, setChapterTitle] = useState('');
    const [currentHref, setCurrentHref] = useState(''); // Track current location href
    const [progress, setProgress] = useState(0);
    const [currentCfi, setCurrentCfi] = useState('');
    const [isLocationsReady, setIsLocationsReady] = useState(false);

    // Store
    const { theme, fontSize, fontFamily, lineHeight, margins, setTheme, setFontSize, setFontFamily, setLineHeight, setMargins } = useSettingsStore();

    useEffect(() => {
        if (!fontFamily) setFontFamily('Georgia');
        if (!lineHeight) setLineHeight(1.6);
        if (!margins) setMargins('medium');
    }, []);

    useEffect(() => {
        loadBook();
        return () => {
            if (bookRef.current) bookRef.current.destroy();
        };
    }, [id]);

    useEffect(() => {
        if (renditionRef.current) applyStyles();
    }, [theme, fontSize, fontFamily, lineHeight, margins]);

    // Handle Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    const applyStyles = () => {
        const rendition = renditionRef.current;
        if (!rendition) return;

        // Register themes
        Object.keys(KINDLE_THEMES).forEach(themeName => {
            rendition.themes.register(themeName, KINDLE_THEMES[themeName].body);
        });

        rendition.themes.select(theme);
        rendition.themes.fontSize(`${fontSize}%`);
        rendition.themes.font(fontFamily);

        // Apply line height and margins
        const marginMap = { small: '1rem', medium: '2rem', large: '3rem' };
        rendition.themes.override('line-height', lineHeight || 1.6);
        rendition.themes.override('padding', `2rem ${marginMap[margins] || '2rem'}`);
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

            // Load Metadata
            book.loaded.metadata.then((meta) => {
                setBookTitle(meta.title);
            });

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
                updateProgress();
            });

            // Helper to update progress & chapter title FIXED
            const updateProgress = () => {
                const currentLocation = rendition.currentLocation();
                if (currentLocation && currentLocation.start) {
                    const cfi = currentLocation.start.cfi;
                    const href = currentLocation.start.href;

                    setCurrentCfi(cfi);
                    setCurrentHref(href); // Store current href for TOC highlighting

                    // Update Percentage
                    if (book.locations.length() > 0) {
                        const pct = book.locations.percentageFromCfi(cfi);
                        setProgress(Math.floor(pct * 100));

                        // Sync
                        if (book.package) {
                            syncProgress(id, book.package.metadata.title, cfi, Math.floor(pct * 100));
                        }
                    }

                    // Update Chapter Title - FIXED: Find the LAST matching chapter, not the first
                    const flatten = (list) => list.reduce(
                        (a, b) => a.concat(b.subitems ? flatten(b.subitems).concat(b) : b), []
                    );
                    const flatToc = flatten(navigation.toc);

                    // Find all chapters that match or are before the current position
                    const hrefPath = href.split('#')[0]; // Get just the file path
                    let currentChapter = null;

                    for (let i = flatToc.length - 1; i >= 0; i--) {
                        const itemHref = flatToc[i].href.split('#')[0];
                        if (hrefPath.includes(itemHref) || itemHref === hrefPath) {
                            currentChapter = flatToc[i];
                            break;
                        }
                    }

                    if (currentChapter) {
                        setChapterTitle(currentChapter.label);
                    }
                }
            };

            // Listeners
            rendition.on('relocated', (location) => {
                updateProgress();
            });

            // DO NOT use rendition.on('click') - it doesn't work reliably with tap zones
            // Tap zones are handled by overlay divs instead

        } catch (err) {
            console.error(err);
            setError(err.message);
            setLoading(false);
        }
    };

    const prevPage = () => renditionRef.current?.prev();
    const nextPage = () => renditionRef.current?.next();

    // Tap zone handlers
    const handleLeftTap = () => {
        if (showControlsRef.current) {
            setShowControls(false);
        } else {
            prevPage();
        }
    };

    const handleRightTap = () => {
        if (showControlsRef.current) {
            setShowControls(false);
        } else {
            nextPage();
        }
    };

    const handleCenterTap = () => {
        if (showControlsRef.current) {
            setShowControls(false);
        } else {
            setShowControls(true);
        }
    };

    // Swipe handler
    const bind = useGesture({
        onDragEnd: ({ movement: [mx], velocity: [vx] }) => {
            // Swipe Right -> Prev Page
            if (mx > 50 && vx > 0.1) {
                prevPage();
            }
            // Swipe Left -> Next Page
            if (mx < -50 && vx > 0.1) {
                nextPage();
            }
        }
    });

    const [showSettings, setShowSettings] = useState(false);

    if (error) return <div className="p-10 text-center text-red-500">Error: {error}</div>;

    const currentTheme = KINDLE_THEMES[theme] || KINDLE_THEMES.light;

    return (
        <div className={clsx("relative w-full h-dvh overflow-hidden flex flex-col", currentTheme.bg)} {...bind()}>
            {/* Header Overlay - Kindle Style */}
            <header className={clsx(
                "fixed top-0 left-0 right-0 z-50 transition-transform duration-300",
                showControls ? "translate-y-0" : "-translate-y-full"
            )}>
                <div className={clsx(
                    "px-4 py-3 flex justify-between items-center backdrop-blur-sm border-b",
                    currentTheme.controlBg, currentTheme.border
                )}>
                    <button
                        onClick={() => navigate('/library')}
                        className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors", currentTheme.text)}
                    >
                        <ArrowLeft size={22} />
                    </button>

                    <h2 className={clsx("font-medium truncate max-w-[50%] text-sm", currentTheme.text)}>
                        {bookTitle || 'Reader'}
                    </h2>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowToc(!showToc)}
                            className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors", currentTheme.text)}
                        >
                            <List size={22} />
                        </button>
                        {/* Fullscreen button - NOW VISIBLE ON MOBILE */}
                        <button
                            onClick={toggleFullscreen}
                            className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors", currentTheme.text)}
                        >
                            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={clsx("p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors", currentTheme.text)}
                            >
                                <Settings size={22} />
                            </button>
                            {/* Settings Dropdown */}
                            {showSettings && (
                                <div className={clsx(
                                    "absolute right-0 top-full mt-2 w-72 rounded-xl shadow-2xl border p-5 z-50",
                                    theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200'
                                )}>
                                    <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Theme</h3>
                                    <div className="grid grid-cols-2 gap-2 mb-5">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={clsx(
                                                "py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium bg-white text-gray-900",
                                                theme === 'light' ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 hover:border-gray-400"
                                            )}
                                        >
                                            Light
                                        </button>
                                        <button
                                            onClick={() => setTheme('sepia')}
                                            className={clsx(
                                                "py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium bg-[#F4E8D8] text-[#5B4636]",
                                                theme === 'sepia' ? "border-blue-500 ring-2 ring-blue-200" : "border-[#D4C8B8] hover:border-[#C4B8A8]"
                                            )}
                                        >
                                            Sepia
                                        </button>
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={clsx(
                                                "py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium bg-[#0F0F0F] text-gray-200",
                                                theme === 'dark' ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-700 hover:border-gray-600"
                                            )}
                                        >
                                            Dark
                                        </button>
                                        <button
                                            onClick={() => setTheme('eye-care')}
                                            className={clsx(
                                                "py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium bg-[#E0F0E3] text-gray-800",
                                                theme === 'eye-care' ? "border-blue-500 ring-2 ring-blue-200" : "border-[#C0D0C3] hover:border-[#B0C0B3]"
                                            )}
                                        >
                                            Eye Care
                                        </button>
                                    </div>

                                    <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Font Size</h3>
                                    <div className="mb-5 flex items-center gap-3">
                                        <button
                                            onClick={() => setFontSize(Math.max(50, fontSize - 10))}
                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                                        >
                                            A-
                                        </button>
                                        <span className="flex-1 text-center text-sm font-medium">{fontSize}%</span>
                                        <button
                                            onClick={() => setFontSize(Math.min(300, fontSize + 10))}
                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                                        >
                                            A+
                                        </button>
                                    </div>

                                    <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Font Family</h3>
                                    <select
                                        value={fontFamily}
                                        onChange={(e) => setFontFamily(e.target.value)}
                                        className="w-full p-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 mb-5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="Georgia">Georgia (Serif)</option>
                                        <option value="Times New Roman">Times New Roman</option>
                                        <option value="Inter">Inter (Sans)</option>
                                        <option value="Arial">Arial</option>
                                    </select>

                                    <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Line Height</h3>
                                    <div className="flex gap-2 mb-5">
                                        <button
                                            onClick={() => setLineHeight(1.4)}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", lineHeight === 1.4 ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Tight
                                        </button>
                                        <button
                                            onClick={() => setLineHeight(1.6)}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", lineHeight === 1.6 ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Normal
                                        </button>
                                        <button
                                            onClick={() => setLineHeight(1.8)}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", lineHeight === 1.8 ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Loose
                                        </button>
                                    </div>

                                    <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Margins</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setMargins('small')}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", margins === 'small' ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Small
                                        </button>
                                        <button
                                            onClick={() => setMargins('medium')}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", margins === 'medium' ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Medium
                                        </button>
                                        <button
                                            onClick={() => setMargins('large')}
                                            className={clsx("flex-1 py-2 rounded-lg border text-sm", margins === 'large' ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 dark:border-gray-600")}
                                        >
                                            Large
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* TOC Drawer - Kindle Style - FIXED HIGHLIGHTING */}
            {showToc && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setShowToc(false)} />
                    <div className={clsx(
                        "relative w-80 max-w-[85%] h-full overflow-y-auto shadow-2xl animate-slide-in-left",
                        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                    )}>
                        <div className="sticky top-0 bg-inherit border-b border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Contents</h3>
                        </div>
                        <div className="p-2">
                            {toc.map((item, idx) => {
                                // FIXED: Compare href paths correctly
                                const itemHrefPath = item.href.split('#')[0];
                                const currentHrefPath = currentHref.split('#')[0];
                                const isActive = currentHrefPath.includes(itemHrefPath) || itemHrefPath === currentHrefPath;

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => { renditionRef.current.display(item.href); setShowToc(false); }}
                                        className={clsx(
                                            "block w-full text-left px-4 py-3 rounded-lg text-sm transition-colors mb-1",
                                            isActive
                                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                                                : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
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
            <div className="flex-1 w-full h-full z-0 relative" ref={viewerRef}>
                {/* INVISIBLE TAP ZONE OVERLAYS - FIXED NAVIGATION */}
                {!showToc && !showSettings && (
                    <>
                        {/* Left Tap Zone (0-25%) - Previous Page */}
                        <div
                            onClick={handleLeftTap}
                            className="absolute left-0 top-0 bottom-0 w-[25%] z-10 cursor-pointer"
                            style={{ background: 'transparent' }}
                        />

                        {/* Right Tap Zone (75-100%) - Next Page */}
                        <div
                            onClick={handleRightTap}
                            className="absolute right-0 top-0 bottom-0 w-[25%] z-10 cursor-pointer"
                            style={{ background: 'transparent' }}
                        />

                        {/* Center Tap Zone (25-75% width, 20-80% height) - Toggle Controls */}
                        <div
                            onClick={handleCenterTap}
                            className="absolute left-[25%] right-[25%] top-[20%] bottom-[20%] z-10 cursor-pointer"
                            style={{ background: 'transparent' }}
                        />
                    </>
                )}
            </div>

            {/* Persistent Footer Info - Kindle Style */}
            <div className={clsx(
                "absolute bottom-0 left-0 right-0 h-7 px-4 flex justify-between items-center text-[10px] opacity-50 bg-transparent z-40 select-none pointer-events-none font-medium",
                currentTheme.text
            )}>
                <span className="truncate max-w-[65%]">{chapterTitle || bookTitle || 'Loading...'}</span>
                <span>{isLocationsReady ? `${progress}%` : '...'}</span>
            </div>

            {/* Footer Overlay - Kindle Style */}
            <footer className={clsx(
                "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 flex flex-col backdrop-blur-sm border-t shadow-[0_-2px_10px_rgba(0,0,0,0.1)]",
                currentTheme.controlBg, currentTheme.border,
                showControls ? "translate-y-0" : "translate-y-full"
            )}>
                {/* Progress Slider */}
                <div className="px-6 pt-4 pb-3">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        disabled={!isLocationsReady}
                        onChange={(e) => {
                            const val = e.target.value;
                            setProgress(val);
                            if (bookRef.current && isLocationsReady) {
                                const cfi = bookRef.current.locations.cfiFromPercentage(val / 100);
                                renditionRef.current.display(cfi);
                            }
                        }}
                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                    />
                </div>

                {/* Navigation Controls */}
                <div className={clsx("flex justify-center items-center gap-8 px-6 py-3", currentTheme.text)}>
                    <button
                        onClick={prevPage}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <ChevronLeft size={28} strokeWidth={2} />
                    </button>

                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="flex flex-col items-center gap-0.5 group px-4 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <Type size={24} strokeWidth={2} />
                        <span className="text-[9px] uppercase font-bold tracking-wider opacity-60 group-hover:opacity-100">Text</span>
                    </button>

                    <button
                        onClick={nextPage}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <ChevronRight size={28} strokeWidth={2} />
                    </button>
                </div>
            </footer>

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-50">
                    <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        <p className="text-sm text-gray-500">Loading book...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reader;
