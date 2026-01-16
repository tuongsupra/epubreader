import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
    persist(
        (set) => ({
            theme: 'light', // 'light', 'dark', 'sepia', 'eye-care'
            fontFamily: 'Georgia',
            fontSize: 100, // percentage
            lineHeight: 1.6,
            margins: 'medium', // 'small', 'medium', 'large'

            setTheme: (theme) => set({ theme }),
            setFontFamily: (fontFamily) => set({ fontFamily }),
            setFontSize: (fontSize) => set({ fontSize }),
            setLineHeight: (lineHeight) => set({ lineHeight }),
            setMargins: (margins) => set({ margins }),
        }),
        {
            name: 'epub-reader-settings',
        }
    )
)
