import { getSupabaseAdmin, json, nowIso } from './_lib.js';

function scoreTitle(title = '') {
  const t = title.toLowerCase();

  let traffic = 20;
  let conversion = 10;
  let discover = 15;
  let social = 10;
  let editorial = 15;
  let contentType = 'analysis';

  const strongBrands = [
    'apple', 'iphone', 'ipad', 'mac', 'samsung', 'galaxy', 'google', 'android',
    'microsoft', 'windows', 'openai', 'chatgpt', 'meta', 'intel', 'qualcomm',
    'xiaomi', 'huawei', 'oneplus', 'sony', 'nvidia', 'amd', 'tesla'
  ];

  const dealWords = ['discount', 'deal', 'sale', 'coupon', 'price', 'indirim', 'fiyat', 'kampanya'];
  const launchWords = ['launch', 'announced', 'introduces', 'unveils', 'tanıttı', 'duyurdu'];
  const updateWords = ['update', 'rollout', 'beta', 'one ui', 'ios', 'android 16', 'windows 11'];

  if (strongBrands.some(w => t.includes(w))) {
    traffic += 15;
    discover += 10;
    editorial += 10;
  }

  if (dealWords.some(w => t.includes(w))) {
    conversion += 25;
    traffic += 10;
    contentType = 'deal';
  }

  if (launchWords.some(w => t.includes(w))) {
    traffic += 15;
    social += 15;
    discover += 10;
    contentType = 'launch';
  }

  if (updateWords.some(w => t.includes(w))) {
    traffic += 10;
    discover += 10;
    social += 10;
    contentType = 'update';
  }

  if (/\b(2022|2023|2024)\b/.test(t)) {
    traffic -= 40;
    conversion -= 20;
    discover -= 30;
    social -= 20;
    editorial -= 20;
  }

  const blacklist = [
    'affiliate', 'grammarly', 'commission junction', 'plr',
    'email marketing', 'how i get free traffic', 'best wordpress plugin'
  ];

  if (blacklist.some(w => t.includes(w))) {
    traffic -= 35;
    conversion -= 35;
    discover -= 35;
    social -= 20;
    editorial -= 25;
  }

  traffic = Math.max(0, Math.min(100, traffic));
  conversion = Math.max(0, Math.min(100, conversion));
  discover = Math.max(0, Math.min(100, discover));
  social = Math.max(0, Math.min(100, social));
  editorial = Math.max(0, Math.min(100, editorial));

  const total = Math.round(
    traffic * 0.30 +
    conversion * 0.20 +
    discover * 0.20 +
    social * 0.10 +
    editorial * 0.20
  );

  return {
    traffic_score: traffic,
    conversion_score: conversion,
    discover_score: discover,
    social_score: social,
    editorial_score: editorial,
    total_score: total,
    content_type_hint: contentType
  };
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';

    if (!expected || token !== expected) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const supabase = getSupabaseAdmin();

    const { data: rows, error } = await supabase
      .from('raw_feed_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return json(res, 500, { error: error.message });

    let processed = 0;

    for (const row of rows || []) {
      const scores = scoreTitle(row.title || '');

      const payload = {
        raw_feed_item_id: row.id,
        source_id: row.source_id || null,
        title: row.title || '',
        summary: row.summary || '',
        url: row.url || row.canonical_url || '',
        image_url: row.image_url || null,
        content_type_hint: scores.content_type_hint,
        total_score: scores.total_score,
        traffic_score: scores.traffic_score,
        conversion_score: scores.conversion_score,
        discover_score: scores.discover_score,
        social_score: scores.social_score,
        editorial_score: scores.editorial_score,
        status: 'active',
        updated_at: nowIso()
      };

      const { data: existing } = await supabase
        .from('topic_candidates')
        .select('id')
        .eq('raw_feed_item_id', row.id)
        .limit(1);

      if (existing && existing.length > 0) {
        const { error: updateError } = await supabase
          .from('topic_candidates')
          .update(payload)
          .eq('raw_feed_item_id', row.id);

        if (!updateError) processed += 1;
      } else {
        const { error: insertError } = await supabase
          .from('topic_candidates')
          .insert(payload);

        if (!insertError) processed += 1;
      }
    }

    return json(res, 200, { ok: true, processed, finished_at: nowIso() });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), finished_at: nowIso() });
  }
}
