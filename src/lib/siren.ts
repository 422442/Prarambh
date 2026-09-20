/**
 * Web Audio API siren generator & Hinglish cheating messages.
 * Uses AudioContext with maximum gain to bypass system mute where possible.
 * Returns a cancel function to stop early.
 */

export const HINGLISH_CHEATING_MESSAGES = [
  "Arre bhai! 🚨 Kahin aur kya dekh rahe ho exam mein? DEVNEST & LTSU ki nazar har jagah hai!",
  "Oye hoye! 🛑 Tab switch karoge toh pakde jaoge — yeh exam hai, magic show nahi!",
  "Bhai sahab, 😤 window chod ke kahan chale? Paper yahan hai, answer wahan nahi milega!",
  "Kya scene hai? 😂 Cheating karoge toh disqualify ho jaoge — seedha ghar jaoge!",
  "Arre yaar! 👀 Fullscreen chod diya? LTSU & DEVNEST dekh raha hai — wapas aao jaldi!",
  "Boss! 🚨 Yeh exam hai, Google nahi — apne dimaag se socho, copy mat karo!",
  "Caught! 📸 DEVNEST ka AI proctor so nahi raha — dobara kiya toh exam submit ho jayega!",
];

export function getRandomFunnyMessage(): string {
  const index = Math.floor(Math.random() * HINGLISH_CHEATING_MESSAGES.length);
  return HINGLISH_CHEATING_MESSAGES[index]!;
}

/**
 * Plays a LOUD oscillating siren.
 * - Uses a DynamicsCompressor so it's always at max audible level regardless of system volume.
 * - Creates a fresh AudioContext each call to bypass prior muting or suspension.
 * - Returns a stop function; auto-stops after durationSeconds.
 */
export function playSirenSound(durationSeconds = 5): () => void {
  try {
    const AudioCtxCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return () => {};

    // Always create a brand-new context to avoid suspended state from mute
    const ctx = new AudioCtxCtor();

    // Force resume immediately (needed after any user interaction)
    const resumePromise = ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    // Compressor settings — maximize perceived loudness
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    osc.type = "sawtooth";

    const setup = () => {
      const now = ctx.currentTime;
      const period = 0.3; // fast sweep for urgency
      const cycles = Math.ceil(durationSeconds / period);

      // Sweep between 700Hz and 1400Hz — wider range = more aggressive
      osc.frequency.setValueAtTime(700, now);
      for (let i = 0; i < cycles; i++) {
        const t = now + i * period;
        osc.frequency.linearRampToValueAtTime(i % 2 === 0 ? 1400 : 700, t + period);
      }

      // Volume: 1.0 = maximum (was 0.2 before)
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.setValueAtTime(1.0, now + Math.max(0, durationSeconds - 0.3));
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);

      osc.connect(gain);
      gain.connect(compressor);
      compressor.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationSeconds);
    };

    // Setup after context is running
    resumePromise.then(setup).catch(() => {
      // Try anyway even if resume failed
      setup();
    });

    let isStopped = false;
    const stopSound = () => {
      if (isStopped) return;
      isStopped = true;
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      ctx.close().catch(() => {});
    };

    // Auto cleanup
    window.setTimeout(stopSound, durationSeconds * 1000 + 200);

    return stopSound;
  } catch (err) {
    console.error("Siren init failed:", err);
    return () => {};
  }
}
