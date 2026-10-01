/**
 * Audio synthesis utilities using native Web Audio API.
 * Provides pleasant audio chimes for device testing, call ringing, and message alerts.
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a pleasant medical clinic test chime for speaker testing.
 */
export function playTestChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

    gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.12 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + idx * 0.12);
    osc.stop(ctx.currentTime + idx * 0.12 + 0.45);
  });
}

/**
 * Play a subtle in-call message alert sound.
 */
export function playMessagePing() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1); // E6

  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.25);
}

/**
 * Create a simple audio volume meter from a MediaStream.
 */
export function createAudioMeter(stream, onVolume) {
  const ctx = getAudioContext();
  if (!ctx || !stream || stream.getAudioTracks().length === 0) return () => {};

  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId = null;

    const checkAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalized = Math.min(100, Math.round((average / 128) * 100));
      onVolume(normalized);
      animationId = requestAnimationFrame(checkAudio);
    };

    checkAudio();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // ignore cleanup errors
      }
    };
  } catch {
    return () => {};
  }
}
