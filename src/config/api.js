// src/config/api.js

// ****************************************************************************
// NOTE: Replace the empty string below with your actual Google AI or Google Cloud API Key.
// For running inside this Canvas environment, we keep it empty.
// ****************************************************************************
export const API_KEY = "AIzaSyB91zmHm25JYw7VXxqoW0rMQqlAaM2Glrw";

// API URLs
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const TEXT_API_URL = `${BASE_URL}/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
export const TTS_API_URL = `${BASE_URL}/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;

// Constants for TTS Audio Processing3
export const SAMPLE_RATE = 24000;
export const NUM_CHANNELS = 1;
export const BIT_DEPTH = 16;