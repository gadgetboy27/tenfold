"use client";

import { useEffect, useRef } from "react";

interface Props {
  videoUrl: string;
  /** Music track to play in sync — the same layering the cinema mix bakes in
   *  at render time, so the preview sounds like the finished film. */
  musicUrl?: string | null;
  className?: string;
  autoPlay?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Video preview with the campaign music layered live: play/pause/seek on the
 * video drives a hidden audio element. When music is present the clip's own
 * audio is muted, matching the final FFmpeg mix (music replaces clip audio).
 */
export function VideoWithMusic({
  videoUrl,
  musicUrl,
  className,
  autoPlay,
  onClick,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Pause the music if the component unmounts mid-play (e.g. closing the
  // fullscreen modal) or the track changes.
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [musicUrl]);

  const syncTime = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    // Loop the music if it's shorter than the clip.
    audio.currentTime = audio.duration
      ? video.currentTime % audio.duration
      : video.currentTime;
  };

  const handlePlay = () => {
    syncTime();
    audioRef.current?.play().catch(() => {});
  };

  const handlePauseOrEnd = () => audioRef.current?.pause();

  return (
    <>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        autoPlay={autoPlay}
        muted={!!musicUrl}
        onPlay={musicUrl ? handlePlay : undefined}
        onPause={musicUrl ? handlePauseOrEnd : undefined}
        onEnded={musicUrl ? handlePauseOrEnd : undefined}
        onSeeked={musicUrl ? syncTime : undefined}
        className={className}
        onClick={onClick}
      />
      {musicUrl && <audio ref={audioRef} src={musicUrl} preload="auto" />}
    </>
  );
}
