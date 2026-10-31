import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useCamera from '../hooks/useCamera';

const makeTrack = () => ({
  stop: vi.fn(),
  getCapabilities: () => ({}),
  applyConstraints: vi.fn().mockResolvedValue(undefined),
});

const installMedia = (impl) => {
  const track = makeTrack();
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = impl ? vi.fn(impl) : vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam1', label: 'Built-in webcam' }]) },
  });
  return { track, getUserMedia };
};

describe('useCamera', () => {
  beforeEach(() => localStorage.clear());

  it('does not ask for the camera while disabled', () => {
    const { getUserMedia } = installMedia();
    renderHook(() => useCamera(false));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('opens the camera when enabled and lists devices', async () => {
    const { getUserMedia } = installMedia();
    const { result } = renderHook(() => useCamera(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(getUserMedia).toHaveBeenCalled();
    expect(result.current.devices[0].label).toBe('Built-in webcam');
  });

  it('releases every media track when disabled', async () => {
    const { track } = installMedia();
    const { result, rerender } = renderHook(({ on }) => useCamera(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ on: false });
    expect(track.stop).toHaveBeenCalled();
  });

  it('releases every media track on unmount', async () => {
    const { track } = installMedia();
    const { result, unmount } = renderHook(() => useCamera(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports a clear message when permission is denied', async () => {
    installMedia(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
    const { result } = renderHook(() => useCamera(true));
    await waitFor(() => expect(result.current.error).toMatch(/denied/i));
    expect(result.current.ready).toBe(false);
  });

  it('falls back to looser constraints when the ideal resolution is rejected', async () => {
    const track = makeTrack();
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('over'), { name: 'OverconstrainedError' }))
      .mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
    });
    const { result } = renderHook(() => useCamera(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(getUserMedia.mock.calls.length).toBeGreaterThan(1);
  });

  it('remembers the chosen camera', async () => {
    installMedia();
    const { result } = renderHook(() => useCamera(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setDeviceId('cam1'));
    expect(localStorage.getItem('scanner.cameraId')).toBe('cam1');
  });
});
