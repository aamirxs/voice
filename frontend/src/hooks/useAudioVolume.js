import { useState, useEffect, useRef } from 'react';

// Shared AudioContext pool — browsers limit to ~6 per tab
let sharedAudioContext = null;
export const getAudioContext = () => {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported/allowed', e);
      return null;
    }
  }
  // Resume if suspended (autoplay policy)
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
};

const useAudioVolume = (stream) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    // Check if audio track is actually live
    const audioTrack = audioTracks[0];
    if (audioTrack.readyState !== 'live' || !audioTrack.enabled) {
      setIsSpeaking(false);
      return;
    }

    const audioContext = getAudioContext();
    if (!audioContext) return;

    let analyser;
    let source;
    try {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
    } catch (err) {
      console.warn("Failed to connect audio context source:", err);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationFrameId;
    let lastState = false;

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const averageVolume = sum / dataArray.length;
      
      // Only update state when it actually changes (avoids unnecessary re-renders)
      const speaking = averageVolume > 20;
      if (speaking !== lastState) {
        lastState = speaking;
        setIsSpeaking(speaking);
      }

      animationFrameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();

    return () => {
      cancelAnimationFrame(animationFrameId);
      // Disconnect the source node (don't close the shared context!)
      try {
        if (source) source.disconnect();
      } catch (e) { /* already disconnected */ }
      sourceRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  return isSpeaking;
};

export default useAudioVolume;
