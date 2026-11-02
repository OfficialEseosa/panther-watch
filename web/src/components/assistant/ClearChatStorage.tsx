"use client";

import { useEffect } from "react";
import { clearStoredChats } from "./chatStore";

/** Rendered for guests: a chat left in this tab by an expired or ended session is forgotten. */
export function ClearChatStorage() {
  useEffect(() => {
    clearStoredChats();
  }, []);
  return null;
}
