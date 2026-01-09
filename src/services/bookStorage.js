
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

    // Sync to Supabase (only metadata/structure, not file)
    // We'll process this in background or ignore for now

    return bookData;
};

export const deleteBook = async (id) => {
    await bookStore.removeItem(id);
    await metadataStore.removeItem(id);
};
