import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * AudioManager — minimal sound system.
 *
 * Sound files are expected in `public/audio/se/<name>.{mp3,ogg}` and `public/audio/bgm/<name>.{mp3,ogg}`.
 * If a file is missing the call no-ops (logs once to console). This way the prototype runs
 * cleanly without bundled audio assets, and bearko can drop CC0/CC-BY files in later.
 *
 * SE list: click / craftSuccess / craftCritical / craftFail / sale / dayAdvance / lvUp / unlock / fanfare
 * BGM list: workshop / midgame / tournament / result
 */

const SE_PATH = (name: string) => `/audio/se/${name}.mp3`;
const BGM_PATH = (name: string) => `/audio/bgm/${name}.mp3`;

interface AudioState {
  master: number; // 0..1
  bgm: number; // 0..1
  se: number; // 0..1
  setMaster: (v: number) => void;
  setBgm: (v: number) => void;
  setSe: (v: number) => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      master: 0.7,
      bgm: 0.5,
      se: 0.7,
      setMaster: (v) => set({ master: clamp01(v) }),
      setBgm: (v) => set({ bgm: clamp01(v) }),
      setSe: (v) => set({ se: clamp01(v) }),
    }),
    { name: 'mcf-audio-settings-v1' },
  ),
);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const warnedMissing = new Set<string>();

export function playSE(name: string): void {
  if (typeof window === 'undefined') return;
  const { master, se } = useAudioStore.getState();
  const volume = master * se;
  if (volume <= 0) return;
  const audio = new Audio(SE_PATH(name));
  audio.volume = volume;
  audio.play().catch(() => {
    if (!warnedMissing.has(name)) {
      warnedMissing.add(name);
      console.info(`[audio] SE not available: ${name} (skipping)`);
    }
  });
}

interface BgmHandle {
  audio: HTMLAudioElement;
  name: string;
}

let currentBgm: BgmHandle | null = null;

export function playBgm(name: string): void {
  if (typeof window === 'undefined') return;
  if (currentBgm?.name === name) return;
  stopBgm();
  const { master, bgm } = useAudioStore.getState();
  const volume = master * bgm;
  if (volume <= 0) return;
  const audio = new Audio(BGM_PATH(name));
  audio.loop = true;
  audio.volume = volume;
  audio.play().catch(() => {
    if (!warnedMissing.has(`bgm:${name}`)) {
      warnedMissing.add(`bgm:${name}`);
      console.info(`[audio] BGM not available: ${name} (skipping)`);
    }
  });
  currentBgm = { audio, name };
}

export function stopBgm(): void {
  if (currentBgm) {
    currentBgm.audio.pause();
    currentBgm.audio.currentTime = 0;
    currentBgm = null;
  }
}

/**
 * React component that mounts a hidden volume-settings panel — currently no-op visible UI,
 * but exposed via useAudioStore for a future settings modal.
 */
export function AudioManager() {
  // Currently auto-starts the workshop BGM on mount (silently no-ops if file missing).
  useEffect(() => {
    playBgm('workshop');
    return () => stopBgm();
  }, []);
  return null;
}

/** Convenience hook for components that want to play SE on user actions. */
export function useSoundEffect() {
  const ref = useRef({ play: playSE });
  return ref.current;
}
