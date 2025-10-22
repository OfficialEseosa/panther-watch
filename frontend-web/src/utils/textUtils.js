/**
 * Text utility functions
 */

/**
 * Decode HTML entities in a string (e.g., &amp; -> &, &quot; -> ", &#39; -> ')
 * @param {string} text - Text containing HTML entities
 * @returns {string} - Decoded text
 */
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Create a temporary element to decode HTML entities
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent || text;
}
