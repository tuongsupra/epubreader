
import localforage from 'localforage';
import ePub from 'epubjs';
import { supabase } from '../lib/supabaseClient';
import { generateBookHash } from '../utils/hash';

const bookStore = localforage.createInstance({
    name: "epub-reader",
    storeName: "books"
});

const metadataStore = localforage.createInstance({
    name: "epub-reader",
    storeName: "metadata"
});

export const getBooks = async () => {
    const keys = await metadataStore.keys();
    const books = await Promise.all(keys.map(key => metadataStore.getItem(key)));
    return books;
};

export const getBookFile = async (id) => {
    return await bookStore.getItem(id);
};

export const addBook = async (file) => {
    const buffer = await file.arrayBuffer();
    const book = ePub(buffer);

    // Parse metadata
    let metadata;
    try {
        await book.ready;
        metadata = await book.loaded.metadata;
    } catch (e) {
        console.error("EpubJS Metadata Error:", e);
        metadata = { title: file.name.replace('.epub', ''), creator: 'Unknown', description: '' };
    }

    let coverData = null;
    try {
        const coverPath = await book.cover;
        if (coverPath) {
            const coverBuffer = await book.archive.createUrl(coverPath, { base64: true });
            coverData = coverBuffer;
        }
    } catch (e) {
        console.warn("Could not extract cover:", e);
    }

    // Determine unique ID based on metadata (Title + Author)
    const uniqueString = `${metadata.title}-${metadata.creator}`;
    const id = await generateBookHash(uniqueString);

    const bookData = {
        id,
        title: metadata.title,
        author: metadata.creator,
        description: metadata.description,
        cover: coverData,
        addedAt: Date.now(),
    };

    await bookStore.setItem(id, file); // Store format: ID -> Blob
    await metadataStore.setItem(id, bookData); // Store format: ID -> Metadata

    // Upload to Cloud (Fire and forget, or handle status)
    uploadBookToCloud(id, file).catch(err => console.error("Cloud upload failed:", err));

    return bookData;
};

export const deleteBook = async (id) => {
    await bookStore.removeItem(id);
    await metadataStore.removeItem(id);
};

// --- Cloud Sync Helpers ---

export const uploadBookToCloud = async (bookId, file) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Use bookId (hash) as filename
    const path = `${user.id}/${bookId}.epub`;
    const { error } = await supabase.storage
        .from('books')
        .upload(path, file, { upsert: true });

    if (error) throw error;
    console.log("Book uploaded to cloud:", path);
};

export const downloadBookFromCloud = async (bookId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const path = `${user.id}/${bookId}.epub`;
    const { data, error } = await supabase.storage
        .from('books')
        .download(path);

    if (error) throw error;
    return data; // Blob
};

export const syncLibrary = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // 1. Fetch remote book list from DB (user_books table)
    const { data: remoteBooks, error } = await supabase
        .from('user_books')
        .select('*')
        .eq('user_id', user.id);

    if (error) {
        console.error("Error fetching remote library:", error);
        return [];
    }

    // 2. Fetch local keys
    const localKeys = await metadataStore.keys();

    const mergedLibrary = [];
    const localSet = new Set(localKeys);

    // Process remote books
    for (const rBook of remoteBooks) {
        const id = rBook.book_hash;

        if (localSet.has(id)) {
            // Book exists locally, get local metadata
            const localMeta = await metadataStore.getItem(id);
            if (localMeta) {
                mergedLibrary.push({ ...localMeta, isCloud: false });
            }
            localSet.delete(id);
        } else {
            // Book is cloud only
            mergedLibrary.push({
                id: id,
                title: rBook.title || "Unknown Cloud Book",
                author: "Cloud Synced",
                cover: null,
                isCloud: true,
                percentage: rBook.percentage || 0
            });
        }
    }

    // Remaining local items
    for (const id of localSet) {
        const localMeta = await metadataStore.getItem(id);
        if (localMeta) {
            mergedLibrary.push({ ...localMeta, isCloud: false });
        }
    }

    // Sort
    mergedLibrary.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return mergedLibrary;
};
