/** Mirrors ALLOWED_TAGS in supabase/functions/design-ingest/index.ts — the
 *  fixed vocabulary the vision model picks tags from (Step 4). Duplicated
 *  here for the same reason MediumFilter duplicates the medium slugs: the
 *  backend list lives in a Deno-only edge function, not importable here.
 *  Used to group the tag filter into labeled sections instead of one flat
 *  list — a virtual grouping, not real boards, so nothing here is stored. */
export const TAG_CATEGORIES = {
  style: [
    'brutalist', 'swiss style', 'art deco', 'art nouveau', 'bauhaus', 'memphis', 'y2k', 'grunge',
    'psychedelic', 'flat design', 'skeuomorphic', 'maximalist',
  ],
  colour: [
    'monochrome', 'black and white', 'pastel', 'neon', 'earth tones', 'jewel tones', 'muted palette',
    'high contrast', 'warm tones', 'cool tones', 'duotone', 'metallic',
  ],
  mood: [
    'playful', 'nostalgic', 'moody', 'serene', 'energetic', 'whimsical', 'somber', 'dreamy', 'edgy',
    'cozy', 'futuristic', 'raw',
  ],
  technique: [
    'hand drawn', 'collage', 'photography', '3d render', 'gradient', 'texture', 'grid layout',
    'asymmetric layout', 'line art', 'halftone', 'glitch effect', 'paper cutout',
  ],
  subject: [
    'portrait', 'product shot', 'landscape', 'architecture', 'interior space', 'fashion', 'food',
    'abstract shapes', 'figure illustration', 'nature', 'cityscape', 'still life',
  ],
} as const;

export type TagCategory = keyof typeof TAG_CATEGORIES;

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  style: 'Style',
  colour: 'Colour',
  mood: 'Mood',
  technique: 'Technique',
  subject: 'Subject',
};

/** Fixed display order — not alphabetical, reads roughly concrete → abstract. */
export const CATEGORY_ORDER: (TagCategory | 'other')[] = [
  'style', 'colour', 'mood', 'technique', 'subject', 'other',
];

const TAG_TO_CATEGORY = new Map<string, TagCategory>();
for (const [category, tags] of Object.entries(TAG_CATEGORIES) as [TagCategory, readonly string[]][]) {
  for (const tag of tags) TAG_TO_CATEGORY.set(tag, category);
}

/** 'other' covers anything outside the fixed list — free-text search still
 *  finds these, per the original tradeoff; this filter just can't group
 *  them meaningfully (legacy tags from before Step 4, Discover-source tags
 *  like "unsplash", anything typed by hand in the manual add-reference form). */
export function categoryOf(tag: string): TagCategory | 'other' {
  return TAG_TO_CATEGORY.get(tag) ?? 'other';
}
