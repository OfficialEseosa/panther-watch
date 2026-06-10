// Flat color palette for schedule classes. Every color is dark enough for
// white text. icsName is the closest CSS3 color name, used for the optional
// COLOR property in calendar exports (RFC 7986 wants names, not hex).

export const SCHEDULE_COLORS = [
  { id: 'blue', value: '#2563eb', label: 'Blue', icsName: 'royalblue' },
  { id: 'teal', value: '#0d9488', label: 'Teal', icsName: 'teal' },
  { id: 'violet', value: '#7c3aed', label: 'Violet', icsName: 'blueviolet' },
  { id: 'pink', value: '#db2777', label: 'Pink', icsName: 'mediumvioletred' },
  { id: 'orange', value: '#ea580c', label: 'Orange', icsName: 'chocolate' },
  { id: 'green', value: '#16a34a', label: 'Green', icsName: 'forestgreen' },
  { id: 'cyan', value: '#0891b2', label: 'Cyan', icsName: 'darkcyan' },
  { id: 'slate', value: '#475569', label: 'Slate', icsName: 'darkslategray' }
];

/**
 * Pick a default color for a newly added course: the first palette color not
 * already used by another class in the same term, cycling when the palette
 * runs out.
 */
export const pickDefaultColor = (existingCourses) => {
  const used = new Set(
    (existingCourses || []).map((course) => course.scheduleColor).filter(Boolean)
  );
  const free = SCHEDULE_COLORS.find((color) => !used.has(color.value));
  if (free) return free.value;
  return SCHEDULE_COLORS[(existingCourses || []).length % SCHEDULE_COLORS.length].value;
};

/**
 * Stable fallback for courses saved before colors existed: hash the CRN into
 * the palette so the same class always renders the same color.
 */
export const colorForCrn = (crn) => {
  const numeric = parseInt(String(crn).replace(/[^0-9]/g, ''), 10);
  const index = Number.isNaN(numeric) ? 0 : numeric % SCHEDULE_COLORS.length;
  return SCHEDULE_COLORS[index].value;
};

export const icsColorName = (hexValue) =>
  SCHEDULE_COLORS.find((color) => color.value === hexValue)?.icsName || null;
