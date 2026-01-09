import { supabase } from '../lib/supabaseClient';

export const syncProgress = async (bookId, title, cfi, percentage) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // IDs are hashes, so bookId is the hash
    const { error } = await supabase
        .from('user_books')
        .upsert({
            user_id: user.id,
            book_hash: bookId,
            title: title,
            last_read_cfi: cfi,
            percentage: percentage,
            updated_at: new Date().toISOString() // Force update time
        }, { onConflict: 'user_id, book_hash' });

    if (error) console.error('Error syncing progress:', error);
};

export const getProgress = async (bookId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_books')
        .select('last_read_cfi, percentage, updated_at')
        .eq('user_id', user.id)
        .eq('book_hash', bookId)
        .single();

    if (error) {
        // console.log('No remote progress found or error', error);
        return null;
    }
    return data;
};
