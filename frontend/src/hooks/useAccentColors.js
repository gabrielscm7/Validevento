import { useThemeStore } from '../store/themeStore'
import { resolveAccent } from '../lib/theme'

export function useAccentColors() {
  const accent = useThemeStore((s) => s.accent)
  const customPrimary = useThemeStore((s) => s.customPrimary)
  const customSecondary = useThemeStore((s) => s.customSecondary)
  return resolveAccent({ accent, customPrimary, customSecondary })
}
