'use client'

import { useCallback } from 'react'

export function useClickSound() {
  const play = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(1200, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08)

      gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.08)
    } catch {}
  }, [])

  return play
}
