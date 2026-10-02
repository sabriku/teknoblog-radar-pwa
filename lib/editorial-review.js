export const REVIEW_STATUSES = ['researching', 'ready', 'hold', 'unreviewed'];

export function validateReview(input = {}) {
  const storyId = String(input.story_id || '');
  const status = String(input.status || '');
  if (!/^[a-f0-9]{16}$/.test(storyId)) throw new Error('Geçersiz konu kimliği');
  if (!REVIEW_STATUSES.includes(status)) throw new Error('Geçersiz inceleme durumu');
  return { story_id: storyId, status };
}
