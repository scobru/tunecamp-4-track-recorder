import type { Track } from '../types.js';

export function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels: Float32Array[] = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // Write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // chunk length
  setUint16(1);          // sample format (raw PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2);                     // block align
  setUint16(16);                                // bits per sample

  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // Write interleaved audio data
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; // scale to 16-bit signed integer
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

export async function renderMixdown(
  tracks: Track[],
  masterVolume: number,
  sampleRate: number
): Promise<Blob> {
  // Find longest duration
  let maxDuration = 0;
  for (const track of tracks) {
    if (track.buffer && track.buffer.duration > maxDuration) {
      maxDuration = track.buffer.duration;
    }
  }

  if (maxDuration === 0) {
    throw new Error("No audio in any track to export");
  }

  // Create OfflineAudioContext (stereo, 16-bit PCM)
  const offlineCtx = new OfflineAudioContext(
    2,
    Math.ceil(sampleRate * maxDuration),
    sampleRate
  );

  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = masterVolume;
  masterGain.connect(offlineCtx.destination);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track.buffer || track.hidden) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = track.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = track.volume;

    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = track.pan;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    // Start playback at the track's trim offset (if any)
    source.start(0, track.trimStart || 0);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return bufferToWav(renderedBuffer);
}
