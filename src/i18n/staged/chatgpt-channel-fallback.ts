import { chatGptChannelCopy } from "../chatgpt-channel";

// Staged locales use the reviewed English wording until translations are available.
export const stagedChatGptChannel = {
  name: "ChatGPT channel",
  copy: Object.freeze({ ...chatGptChannelCopy.en }),
  namespaces: ["chatGptChannel"],
  sourceRevision: "2026-11-21 (English fallback)",
  sourceHash: "ec94dbebccd4db065ce9fad2d11281bac195a1c468a9e8b63d0a91ee24780808",
} as const;
