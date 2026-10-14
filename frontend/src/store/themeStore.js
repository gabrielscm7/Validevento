import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SETTINGS, applyTheme, resolveIsDark } from '../lib/theme'

function sync(settings) {
  applyTheme(settings)
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.dispatchEvent(new CustomEvent('vv:theme-change', { detail: settings }))
  }
}

export const useThemeStore = create(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setSetting: (key, value) => {
        set({ [key]: value })
        sync(get())
      },
      setMode: (mode) => get().setSetting('mode', mode),
      setAccent: (accent) => get().setSetting('accent', accent),
      setCustomPrimary: (hex) => get().setSetting('customPrimary', hex),
      setCustomSecondary: (hex) => get().setSetting('customSecondary', hex),
      setStyle: (style) => get().setSetting('style', style),
      setRadius: (radius) => get().setSetting('radius', radius),
      setFont: (font) => get().setSetting('font', font),
      setDensity: (density) => get().setSetting('density', density),
      setMotion: (motion) => get().setSetting('motion', motion),
      reset: () => {
        set({ ...DEFAULT_SETTINGS })
        sync(get())
      },
      apply: () => sync(get()),
      isDark: () => resolveIsDark(get().mode),
    }),
    {
      name: 'vv_theme',
      partialize: (state) => ({
        mode: state.mode,
        accent: state.accent,
        customPrimary: state.customPrimary,
        customSecondary: state.customSecondary,
        style: state.style,
        radius: state.radius,
        font: state.font,
        density: state.density,
        motion: state.motion,
      }),
    },
  ),
)

let mediaBound = false

export function bootstrapTheme() {
  const store = useThemeStore.getState()
  store.apply()

  useThemeStore.subscribe(() => useThemeStore.getState().apply())

  if (typeof window !== 'undefined' && window.matchMedia && !mediaBound) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (useThemeStore.getState().mode === 'system') useThemeStore.getState().apply()
    }
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else if (mq.addListener) mq.addListener(handler)
    mediaBound = true
  }
}
