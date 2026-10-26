import { Inter } from "next/font/google";

/**
 * Inter (spec.md §1.3): self-hosted by next/font, preloaded, metric-matched fallback. Variable
 * font, so no weights listed. Exposed as --font-inter, which --font-sans in tokens.css reads.
 */
export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
