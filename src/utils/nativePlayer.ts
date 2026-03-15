import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NativePlayerProgressEvent = {
  positionMs: number;
  durationMs: number;
  bufferedPositionMs: number;
  playbackState: number;
  isPlaying: boolean;
};

export type NativePlayerErrorEvent = {
  message: string;
};

export type NativePlayerAutoplayOverlay = {
  visible: boolean;
  title?: string;
  remainingSeconds?: number;
};

export type NativePlayerOpenOptions = {
  url: string;
  title: string;
  sourceKey: string;
  subtitleUrl?: string;
  startPositionMs?: number;
};

export interface NativePlayerPlugin {
  open(options: NativePlayerOpenOptions): Promise<void>;
  close(): Promise<void>;
  updateAutoplayOverlay(options: NativePlayerAutoplayOverlay): Promise<void>;
  addListener(eventName: 'progress', listenerFunc: (event: NativePlayerProgressEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'ended', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'backRequest', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'autoplayDismissed', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'error', listenerFunc: (event: NativePlayerErrorEvent) => void): Promise<PluginListenerHandle>;
}

export const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayer');
