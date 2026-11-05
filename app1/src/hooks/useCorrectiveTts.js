import { useEffect, useRef } from 'react';
import { correctiveTts } from '../utils/correctiveTts';

/**
 * Hook to automatically speak corrective feedback during active yoga practice.
 *
 * @param {Object} params
 * @param {boolean} params.active - Whether the practice session is currently actively recording
 * @param {string|string[]} params.feedback - Current corrective feedback text or array from the correction engine
 */
export function useCorrectiveTts({ active = false, feedback = null }) {
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    correctiveTts.setActive(active);
    if (!active) {
      correctiveTts.stop();
      return;
    }

    if (feedback) {
      correctiveTts.speak(feedback);
    }
  }, [active, feedback]);

  // Clean up and stop speech when unmounting or when inactive
  useEffect(() => {
    correctiveTts.stop();
    return () => {
      correctiveTts.setActive(false);
      correctiveTts.stop();
    };
  }, []);

  return {
    stop: () => correctiveTts.stop(),
    speak: (t) => {
      if (activeRef.current) correctiveTts.speak(t);
    },
    setMuted: (m) => correctiveTts.setMuted(m),
    isMuted: () => correctiveTts.isMuted(),
  };
}

export default useCorrectiveTts;
