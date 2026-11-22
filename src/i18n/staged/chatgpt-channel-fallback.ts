import { chatGptChannelCopy } from "../chatgpt-channel";

// Staged locales use the reviewed English wording until translations are available.
export const stagedChatGptChannel = {
  name: "ChatGPT channel",
  copy: Object.freeze({ ...chatGptChannelCopy.en }),
  namespaces: ["chatGptChannel"],
  sourceRevision: "2026-11-22 (English fallback)",
  sourceHash: "e119796bfa8d63e8f48a160500d0f204ff1596f965cc4583eef2ff1f3e323364",
} as const;
