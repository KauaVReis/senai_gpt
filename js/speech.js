// ============================================================================
// INOVA SENAI — Reconhecimento e Síntese de Voz (Web Speech API)
// ============================================================================

export class SpeechService {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this._initSTT();
    }

    _initSTT() {
        if (typeof window === 'undefined') return;
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            this.recognition = new SpeechRec();
            this.recognition.lang = 'pt-BR';
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
        }
    }

    startListening({ onResult, onEnd, onError }) {
        if (!this.recognition) {
            throw new Error('Reconhecimento de voz não suportado neste navegador.');
        }

        if (this.isRecording) {
            this.recognition.stop();
            this.isRecording = false;
            if (onEnd) onEnd();
            return false;
        }

        this.recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            this.isRecording = false;
            if (onResult) onResult(transcript);
        };

        this.recognition.onerror = (err) => {
            this.isRecording = false;
            if (onError) onError(err);
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            if (onEnd) onEnd();
        };

        this.recognition.start();
        this.isRecording = true;
        return true;
    }

    stopListening() {
        if (this.recognition && this.isRecording) {
            this.recognition.stop();
            this.isRecording = false;
        }
    }

    speak(text, onStart = null, onEnd = null) {
        if (!('speechSynthesis' in window)) return;

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            if (onEnd) onEnd();
            return false;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;

        if (onStart) utterance.onstart = onStart;
        utterance.onend = () => {
            if (onEnd) onEnd();
        };
        utterance.onerror = () => {
            if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(utterance);
        return true;
    }

    cancelSpeech() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }
}

export const speechService = new SpeechService();
