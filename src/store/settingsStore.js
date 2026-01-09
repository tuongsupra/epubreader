import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
    persist(
        (set) => ({
            theme: 'light', // 'light', 'dark', 'sepia'
            fontFamily: 'Inter',
            fontSize: 100, // percentage

            setTheme: (theme) => set({ theme }),
            setFontFamily: (fontFamily) => set({ fontFamily }),
            setFontSize: (fontSize) => set({ fontSize }),

            // We might need more settings like line height, margin
        }),
        {
            name: 'epub-reader-settings',
        }
    )
)
