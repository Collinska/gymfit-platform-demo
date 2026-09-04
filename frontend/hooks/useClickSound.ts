'use client'

import { useCallback } from 'react'

// Click sound disabled per request — kept as a no-op so call sites (e.g.
// Sidebar's onClick={playClick}) don't need to change.
export function useClickSound() {
  const play = useCallback(() => {}, [])
  return play
}
