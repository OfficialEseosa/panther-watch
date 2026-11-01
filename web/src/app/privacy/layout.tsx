import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/site";

/** Holds only the canonical URL; title and description live on the page. */
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/privacy") },
};

export default function PrivacyLayout({ children }: LayoutProps<"/privacy">) {
  return children;
}
