import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import { getBookFile } from '../services/bookStorage';
import { useSettingsStore } from '../store/settingsStore';
import { syncProgress, getProgress } from '../services/syncService';
import { ArrowLeft, Settings, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGesture } from '@use-gesture/react';
import clsx from 'clsx';

const Reader = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    // UI State
    const [showControls, setShowControls] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toc, setToc] = useState([]);

    // Store
    const { theme, fontSize, fontFamily, setTheme, setFontSize } = useSettingsStore();

    useEffect(() => {
        loadBook();

        return () => {
            if (bookRef.current) {
                bookRef.current.destroy();
            }
        };
    }, [id]);

    useEffect(() => {
        if (renditionRef.current) {
            applyStyles();
        }
    }, [theme, fontSize, fontFamily]);

    const applyStyles = () => {
        const rendition = renditionRef.current;
        if (!rendition) return;

        const themeColors = {
            light: { body: { color: '#000', background: '#fff' } },
            dark: { body: { color: '#d1d5db', background: '#111827' } }, // slate-300, slate-900
            sepia: { body: { color: '#5f4b32', background: '#f6e5cb' } },
        };

        rendition.themes.register('light', themeColors.light);
        rendition.themes.register('dark', themeColors.dark);
        rendition.themes.register('sepia', themeColors.sepia);

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
                // spread: 'always' // force single page on mobile?
            });
            renditionRef.current = rendition;

            // Load and apply styles
            await rendition.display();
            applyStyles();

            // Get TOC
            const navigation = await book.loaded.navigation;
            setToc(navigation.toc);

            // Listeners
            rendition.on('relocated', (location) => {
                const cfi = location.start.cfi;
                const percentage = location.start.percentage;

                if (bookRef.current && bookRef.current.package) {
                    const title = bookRef.current.package.metadata.title;
                    syncProgress(id, title, cfi, percentage);
                }
            });

            // Tap Zones Logic (Kindle-style)
            rendition.on('click', (e) => {
                const width = window.innerWidth;
                const x = e.clientX;

                // Left 30% -> Prev
                if (x < width * 0.3) {
                    prevPage();
                }
                // Right 30% -> Next
                else if (x > width * 0.7) {
                    nextPage();
                }
                // Center -> Toggle Controls
                else {
                    toggleControls();
                }
            });

            // Check for cloud progress
            const remoteData = await getProgress(id);
            if (remoteData && remoteData.last_read_cfi) {
                // Determine if we should jump
                rendition.display(remoteData.last_read_cfi);
            }

            // rendition.on('selected', () => setShowControls(true));
            // Note: Click handling is now covered by our custom click listener above for better zone control

            setLoading(false);
        } catch (err) {
            console.error(err);
            setError(err.message);
            setLoading(false);
        }
    };

    const prevPage = () => renditionRef.current?.prev();
    const nextPage = () => renditionRef.current?.next();

    // Gestures
    const bind = useGesture({
        onDragEnd: ({ movement: [mx], velocity: [vx] }) => {
            if (mx > 50 && vx > 0.2) prevPage();
            if (mx < -50 && vx > 0.2) nextPage();
        }
    });

    const toggleControls = () => setShowControls(!showControls);
    const [showSettings, setShowSettings] = useState(false);

    if (error) return <div className="p-10 text-center text-red-500">Error: {error}</div>;

    const bgClass = theme === 'dark' ? 'bg-slate-900' : theme === 'sepia' ? 'bg-[#F6E5CB]' : 'bg-white';
    const textClass = theme === 'dark' ? 'text-gray-300' : theme === 'sepia' ? 'text-[#5F4B32]' : 'text-gray-800';

    return (
        <div className={clsx("relative w-full h-dvh overflow-hidden flex flex-col", bgClass)} {...bind()}>
            {/* Top Bar */}
            <header className={clsx(
                "absolute top-0 left-0 right-0 z-10 transition-transform duration-300 p-4 flex justify-between items-center bg-inherit/95 backdrop-blur shadow-sm",
                showControls ? "translate-y-0" : "-translate-y-full"
            )}>
                <button onClick={() => navigate('/library')} className={clsx("p-2 rounded-full hover:bg-black/5", textClass)}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={clsx("font-semibold truncate max-w-[60%]", textClass)}>Reader</h2>
                <div className="relative">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={clsx("p-2 rounded-full hover:bg-black/5", textClass)}
                    >
                        <Settings size={24} />
                    </button>

                    {/* Settings Dropdown */}
                    {showSettings && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50 text-gray-900 dark:text-gray-100">
                            <h3 className="font-semibold mb-3 text-sm uppercasetracking-wider text-gray-500">Appearance</h3>

                            {/* Theme */}
                            <div className="flex gap-2 mb-4">
                                <button onClick={() => setTheme('light')} className={clsx("flex-1 py-1 rounded border", theme === 'light' ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-300 dark:border-gray-600")}>Light</button>
                                <button onClick={() => setTheme('sepia')} className={clsx("flex-1 py-1 rounded border bg-[#f6e5cb] text-[#5f4b32]", theme === 'sepia' ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-300 dark:border-gray-600")}>Sepia</button>
                                <button onClick={() => setTheme('dark')} className={clsx("flex-1 py-1 rounded border bg-gray-900 text-gray-100", theme === 'dark' ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-300 dark:border-gray-600")}>Dark</button>
                            </div>

                            {/* Font Size */}
                            <div className="mb-4">
                                <label className="text-xs mb-1 block">Font Size: {fontSize}%</label>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setFontSize(Math.max(50, fontSize - 10))} className="p-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200">A-</button>
                                    <input
                                        type="range" min="50" max="200" step="10"
                                        value={fontSize}
                                        onChange={(e) => setFontSize(Number(e.target.value))}
                                        className="flex-1"
                                    />
                                    <button onClick={() => setFontSize(Math.min(300, fontSize + 10))} className="p-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200">A+</button>
                                </div>
                            </div>

                            {/* Font Family */}
                            <div>
                                <label className="text-xs mb-1 block">Font Family</label>
                                <select
                                    value={fontFamily}
                                    onChange={(e) => setFontFamily(e.target.value)}
                                    className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent"
                                >
                                    <option value="Inter">Inter (Sans)</option>
                                    <option value="Times New Roman">Times New Roman (Serif)</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Arial">Arial</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Viewer Area */}
            <div
                className="flex-1 w-full h-full z-0 px-2 sm:px-10 py-12 sm:py-6"
                ref={viewerRef}
            // onClick handled by rendition event
            />

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
            )}

            {/* Bottom Controls */}
            <footer className={clsx(
                "absolute bottom-0 left-0 right-0 z-10 transition-transform duration-300 p-4 flex justify-between items-center bg-inherit/95 backdrop-blur shadow-[0_-1px_3px_rgba(0,0,0,0.1)]",
                showControls ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="flex gap-4 items-center w-full justify-center">
                    <button onClick={prevPage} className={clsx("p-3 rounded-full hover:bg-black/5", textClass)}><ChevronLeft /></button>
                    {/* Progress Slider could go here */}
                    <span className={clsx("text-xs", textClass)}>Page 1 / 100</span>
                    <button onClick={nextPage} className={clsx("p-3 rounded-full hover:bg-black/5", textClass)}><ChevronRight /></button>
                </div>
            </footer>
        </div>
    );
};

export default Reader;
