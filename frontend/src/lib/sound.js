/** Feedback sonoro via Web Audio API (sem arquivos externos). */
export function playSound(status) {
  try {
    if (typeof window === 'undefined') return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime

    const tone = (freq, start, dur, peak = 0.18) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t0 = now + start
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.start(t0)
      osc.stop(t0 + dur + 0.05)
    }

    if (status === 'authorized' || status === 'checkout' || status === 'checkout_registered') {
      tone(880, 0, 0.15)
    } else if (status === 'duplicate') {
      tone(440, 0, 0.2)
      tone(440, 0.3, 0.2)
    } else {
      tone(220, 0, 0.5)
    }
  } catch { /* audio indisponível */ }
}

export default playSound
