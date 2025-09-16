import { create } from 'zustand';

import type { ProctorEvent, SessionVideoReference } from '@focus-proctor/types';
import type { FocusState, SessionStatus } from '../types/session';

interface SessionStateShape {
  sessionId: string | null;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  focusState: FocusState;
  fps: number;
  avgFps: number;
  fpsSamples: number;
  events: ProctorEvent[];
  videoRef?: SessionVideoReference;
}

const createInitialState = (): SessionStateShape => ({
  sessionId: null,
  status: 'idle',
  startedAt: null,
  endedAt: null,
  focusState: 'focused',
  fps: 0,
  avgFps: 0,
  fpsSamples: 0,
  events: [],
  videoRef: undefined,
});

interface SessionStoreState extends SessionStateShape {
  beginSession: (candidateName?: string) => string;
  beginSessionWithId: (sessionId: string, candidateName?: string) => string;
  endSession: () => void;
  resetSession: () => void;
  logEvent: (event: ProctorEvent) => void;
  drainEvents: () => ProctorEvent[];
  setFocusState: (state: FocusState) => void;
  updateFps: (fps: number) => void;
  setVideoRef: (ref?: SessionVideoReference) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  ...createInitialState(),
  beginSession: (candidateName?: string) => {
    const sessionId = crypto.randomUUID();
    set(() => ({
      ...createInitialState(),
      sessionId,
      status: 'running',
      startedAt: Date.now(),
    }));
    return sessionId;
  },
  beginSessionWithId: (sessionId: string, _candidateName?: string) => {
    set(() => ({
      ...createInitialState(),
      sessionId,
      status: 'running',
      startedAt: Date.now(),
    }));
    return sessionId;
  },
  endSession: () => {
    const { status } = get();
    if (status !== 'running') {
      return;
    }
    set(() => ({
      status: 'stopped',
      endedAt: Date.now(),
      fps: 0,
      focusState: 'focused',
    }));
  },
  resetSession: () => set(() => ({ ...createInitialState() })),
  logEvent: (event) => {
    set((state) => ({ events: [...state.events, event] }));
  },
  drainEvents: () => {
    const current = get().events;
    set(() => ({ events: [] }));
    return current;
  },
  setFocusState: (focusState) => set(() => ({ focusState })),
  updateFps: (fps) => {
    set((state) => {
      const fpsSamples = state.fpsSamples + 1;
      const avgFps = state.avgFps + (fps - state.avgFps) / fpsSamples;
      return {
        fps,
        avgFps,
        fpsSamples,
      };
    });
  },
  setVideoRef: (ref) => set(() => ({ videoRef: ref })),
}));

export type { FocusState, SessionStatus };
