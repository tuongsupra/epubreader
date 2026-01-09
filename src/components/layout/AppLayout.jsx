import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Settings, User, Library } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import clsx from 'clsx';

const AppLayout = () => {
    const { theme } = useSettingsStore();

    // Apply theme class to a wrapper or body (useEffect in App.jsx preferred, but here works for scoped)
    // Actually, better to handle theme globally.

    return (
        <div className={clsx("flex h-dvh w-screen overflow-hidden transition-colors duration-300",
            theme === 'dark' ? 'bg-slate-900 text-slate-100' :
                theme === 'sepia' ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-900'
        )}>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 flex-col border-r border-black/10 dark:border-white/10 p-4">
                <div className="mb-8 flex items-center gap-2 px-2">
                    <BookOpen className="h-6 w-6 text-indigo-500" />
                    <span className="font-bold text-xl tracking-tight">EpubReader</span>
                </div>

                <nav className="flex-1 space-y-1">
                    <NavCallback to="/library" icon={Library} label="Library" />
                    <NavCallback to="/settings" icon={Settings} label="Settings" />
                </nav>

                <div className="border-t border-black/10 dark:border-white/10 pt-4">
                    <NavCallback to="/profile" icon={User} label="Profile" />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative">
                <Outlet />
            </main>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden flex items-center justify-around border-t border-black/10 dark:border-white/10 bg-inherit p-3 absolute bottom-0 w-full z-10">
                <NavCallbackMobile to="/library" icon={Library} label="Library" />
                <NavCallbackMobile to="/settings" icon={Settings} label="Settings" />
                <NavCallbackMobile to="/profile" icon={User} label="Profile" />
            </nav>
        </div>
    );
};

const NavCallback = ({ to, icon: Icon, label }) => (
    <NavLink
        to={to}
        className={({ isActive }) => clsx(
            "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
            isActive
                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400"
        )}
    >
        <Icon size={20} />
        {label}
    </NavLink>
);

const NavCallbackMobile = ({ to, icon: Icon, label }) => (
    <NavLink
        to={to}
        className={({ isActive }) => clsx(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            isActive
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-500 dark:text-gray-400"
        )}
    >
        <Icon size={24} />
        <span className="text-xs font-medium">{label}</span>
    </NavLink>
);

export default AppLayout;
