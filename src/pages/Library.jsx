import React, { useEffect, useState } from 'react';
import { getBooks, addBook, deleteBook, syncLibrary, downloadBookFromCloud } from '../services/bookStorage';
import { Plus, Trash2, BookOpen, Cloud, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Library = () => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0); // 0-100
    const [currentFile, setCurrentFile] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        loadBooks();
    }, []);

    const loadBooks = async () => {
        setLoading(true);
        try {
            // Try sync first, fall back to local if error/offline
            try {
                const data = await syncLibrary();
                if (data.length > 0) {
                    setBooks(data);
                } else {
                    // If sync returns empty but we have local? 
                    // Actually syncLibrary returns merged. If empty means empty.
                    // But if offline, syncLibrary might return empty array passed from remote error check?
                    // Let's refine syncLibrary later to handle offline explicitly.
                    // For now assume it works or returns local only.
                    if (data.length === 0) {
                        // Fallback check local just in case sync failed quietly
                        const localOnly = await getBooks();
                        setBooks(localOnly.sort((a, b) => b.addedAt - a.addedAt));
                    } else {
                        setBooks(data);
                    }
                }
            } catch (e) {
                console.warn("Sync failed, loading local:", e);
                const data = await getBooks();
                data.sort((a, b) => b.addedAt - a.addedAt);
                setBooks(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (e, book) => {
        e.stopPropagation();
        if (loading) return;

        // Show loading state for this item? 
        // For simplicity, global loading or alerts.
        if (!confirm(`Download "${book.title}" from cloud?`)) return;

        setProcessing(true);
        setCurrentFile(book.title);

        try {
            const blob = await downloadBookFromCloud(book.id);
            // Convert Blob to File object to reuse addBook
            const file = new File([blob], `${book.title}.epub`, { type: "application/epub+zip" });

            // Add book (this acts as "processing" logic too)
            // Note: addBook uploads to cloud again by default in our logic? 
            // We should optimization addBook to skip upload if it's already there?
            // Or just let it upsert (doesn't hurt).
            await addBook(file);

            await loadBooks();
        } catch (err) {
            alert("Download failed: " + err.message);
        } finally {
            setProcessing(false);
            setCurrentFile('');
        }
    };

    const handleFileChange = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setProcessing(true);
        const total = files.length;

        try {
            // Process each file
            for (let i = 0; i < total; i++) {
                setCurrentFile(files[i].name);
                // Start of file
                setProgress(Math.round(((i) / total) * 100));

                // Small explicit delay to show UI
                await new Promise(resolve => setTimeout(resolve, 100));

                try {
                    await addBook(files[i]);
                } catch (err) {
                    console.error("Failed to add book:", files[i].name, err);
                    alert(`Failed to add book ${files[i].name}. Error: ${err.message}`);
                }

                // End of file
                setProgress(Math.round(((i + 1) / total) * 100));
            }
            await loadBooks();
        } catch (error) {
            console.error("General error adding books:", error);
            alert("An error occurred while adding books. Check console.");
        } finally {
            setProcessing(false);
            setProgress(0);
            setCurrentFile('');
            e.target.value = '';
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm("Delete this book?")) {
            await deleteBook(id);
            await loadBooks();
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Library</h1>
                <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors shadow-lg shadow-indigo-500/20">
                    <Plus size={20} />
                    <span className="font-medium">Add Book</span>
                    <input
                        type="file"
                        accept=".epub"
                        className="hidden"
                        multiple
                        onChange={handleFileChange}
                    />
                </label>
            </header>

            {/* Processing Overlay */}
            {processing && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4">
                        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Importing Books...</h3>
                        <p className="text-sm text-gray-500 mb-4 truncate">Processing: {currentFile}</p>

                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-2">
                            <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="text-right text-xs text-gray-500">{progress}%</div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
            ) : books.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Empty Library</h3>
                    <p className="text-gray-500 mt-1">Add your first EPUB book to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {books.map(book => (
                        <div
                            key={book.id}
                            onClick={(e) => book.isCloud ? handleDownload(e, book) : navigate(`/read/${book.id}`)}
                            className="group relative flex flex-col cursor-pointer bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 mx-auto w-full max-w-[200px]"
                        >
                            <div className="aspect-[2/3] w-full overflow-hidden rounded-t-xl bg-gray-200 dark:bg-gray-700 relative">
                                {book.cover ? (
                                    <img src={book.cover} alt={book.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                        {book.isCloud ? <Cloud size={40} className="text-indigo-400" /> : <BookOpen size={40} />}
                                        {book.isCloud && <span className="text-xs font-medium text-indigo-500">Cloud Only</span>}
                                    </div>
                                )}

                                {book.isCloud && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="text-white h-10 w-10" />
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                            </div>

                            <div className="p-3">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm" title={book.title}>{book.title || "Untitled"}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author || "Unknown Author"}</p>
                            </div>

                            <button
                                onClick={(e) => handleDelete(e, book.id)}
                                className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-black/60 text-red-500 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white hover:text-red-600 transition-all shadow-sm"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Library;
