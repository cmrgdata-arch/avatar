/**
 * Text-to-Speech (TTS) Engine for Yoga Corrective Feedback.
 * Uses browser-native SpeechSynthesis API.
 *
 * Designed specifically for yoga posture coaching:
 * - Deduplicates identical frame-by-frame instructions.
 * - Prevents speech overlap and prevents speech queues from building up.
 * - Enforces minimum spacing between instructions so speech remains natural and calming.
 * - Filters out technical logs, empty values, and formatting symbols.
 * - Allows easy extension for volume, speech rate, and mute control.
 */

class CorrectiveTtsService {
  constructor() {
    this.enabled = true;
    this.active = false;
    this.muted = false;
    this.rate = 0.95; // Calm, clear yoga instructor tempo
    this.pitch = 1.0;
    this.volume = 1.0;

    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    this.minRepeatIntervalMs = 8000; // Do not repeat identical instruction for at least 8 seconds
    this.minNewIntervalMs = 2500; // Minimum time before starting a new instruction to avoid audio clipping

    this.selectedVoice = null;
    this.initialized = false;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  /**
   * Discovers and selects the clearest English voice available on the platform.
   */
  initVoices() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Prefer high-quality natural English voices (Google, Microsoft, Apple, or en-US/en-GB)
    const preferredVoices = [
      "Microsoft Zira",
      "Google US English",
      "Samantha",
      "Victoria",
      "Karen",
      "Daniel",
      "Natural",
    ];

    let chosen = null;
    for (const name of preferredVoices) {
      chosen = voices.find(
        (v) =>
          v.name.includes(name) &&
          (v.lang.startsWith("en") || v.lang.startsWith("en-US") || v.lang.startsWith("en-GB"))
      );
      if (chosen) break;
    }

    if (!chosen) {
      chosen = voices.find(
        (v) => v.lang.startsWith("en-US") || v.lang.startsWith("en-GB") || v.lang.startsWith("en")
      );
    }

    this.selectedVoice = chosen || voices[0] || null;
    this.initialized = true;
  }

  /**
   * Sanitizes feedback text, removing symbols, emojis, and formatting artifacts.
   */
  sanitizeText(input) {
    if (!input) return "";

    let raw = "";
    if (Array.isArray(input)) {
      // If array of correction phrases, take the top 1 or 2 key instructions
      const valid = input.filter((item) => typeof item === "string" && item.trim().length > 0);
      raw = valid.slice(0, 2).join(". ");
    } else if (typeof input === "string") {
      raw = input;
    } else {
      return "";
    }

    // Remove emojis, special marks, percentages, HTML tags
    let cleaned = raw
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/[\u2713\u2714\u2717\u2718\u2014\u2013\u2022\u25cf\u25cb\u25a0\u25a1]/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\b\d+(\.\d+)?%\b/g, "") // remove percentages like "85%"
      .replace(/\s+/g, " ")
      .trim();

    // Ignore placeholder, empty, or purely diagnostic phrases
    const lower = cleaned.toLowerCase();
    if (
      !cleaned ||
      cleaned === "—" ||
      cleaned === "-" ||
      lower.includes("no major adjustments") ||
      lower.includes("detecting pose") ||
      lower.includes("unavailable") ||
      lower.includes("step back") ||
      lower.includes("error") ||
      lower.includes("collecting")
    ) {
      return "";
    }

    // Ensure it ends with a period for clear sentence inflection
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += ".";
    }

    return cleaned;
  }

  /**
   * Speaks the corrective instruction if valid, not muted, and not duplicate.
   */
  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) {
      this.stop();
    }
  }

  speak(input) {
    if (!this.enabled || this.muted || !this.active) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const text = this.sanitizeText(input);
    if (!text) return;

    const now = Date.now();
    const isSameText = text.toLowerCase() === this.lastSpokenText.toLowerCase();

    // 1. Deduplication: Don't repeat the identical instruction within minRepeatIntervalMs
    if (isSameText && now - this.lastSpokenTime < this.minRepeatIntervalMs) {
      return;
    }

    // 2. Anti-overlap / pacing: Don't speak a new instruction too quickly to avoid chopping previous audio
    if (!isSameText && now - this.lastSpokenTime < this.minNewIntervalMs) {
      return;
    }

    // 3. Clear pending speech queue to prevent old feedback from accumulating
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }

    if (!this.selectedVoice) {
      this.initVoices();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onerror = (e) => {
      // Non-fatal speech error (e.g. cancelled)
      if (e.error !== "canceled" && e.error !== "interrupted") {
        console.warn("Speech synthesis notice:", e.error);
      }
    };

    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Speech synthesis speak exception:", err);
    }
  }

  /**
   * Immediately stops any speech in progress.
   */
  stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.stop();
    }
  }

  isMuted() {
    return this.muted;
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, Number(rate) || 1.0));
  }

  setVolume(volume) {
    this.volume = Math.max(0.0, Math.min(1.0, Number(volume) || 1.0));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stop();
    }
  }
}

// Global singleton instance for clean cross-component state
export const correctiveTts = new CorrectiveTtsService();
export default correctiveTts;
