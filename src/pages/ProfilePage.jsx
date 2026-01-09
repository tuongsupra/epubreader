import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Mail } from 'lucide-react';

const ProfilePage = () => {
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    if (!user) return <div className="p-8 text-center">Loading profile...</div>;

    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <div className="flex flex-col items-center mb-6">
                <div className="bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-full mb-4">
                    <User className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Profile</h2>
            </div>

            <div className="space-y-4 mb-8">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center gap-3">
                    <Mail className="text-gray-400" size={20} />
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Email</p>
                        <p className="text-gray-900 dark:text-white font-medium">{user.email}</p>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-1">User ID</p>
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">{user.id}</p>
                </div>
            </div>

            <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
                <LogOut size={18} />
                Sign Out
            </button>
        </div>
    );
};

export default ProfilePage;
