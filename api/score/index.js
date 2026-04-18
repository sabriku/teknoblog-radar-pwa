import { getSupabaseAdmin, json, nowIso, hashValue } from '../_lib.js';

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreTitle(title = '', publishedAt = null) {
  const t = title.toLowerCase();

  let traffic = 38;
  let conversion = 24;
  let discover = 34;
  let social = 26;
  let editorial = 36;
  let contentType = 'analysis';

  const strongBrands = [
    'apple', 'iphone', 'ipad', 'mac', 'samsung', 'galaxy', 'google', 'android',
    'microsoft', 'windows', 'openai', 'chatgpt', 'meta', 'intel', 'qualcomm',
    'xiaomi', 'huawei', 'oneplus', 'sony', 'nvidia', 'amd', 'tesla', 'gemini'
  ];

  const dealWords = ['discount', 'deal', 'sale', 'coupon', 'price', 'indirim', 'fiyat', 'kampanya', 'sepette', 'prime'];
  const launchWords = ['launch', 'announced', 'introduces', 'unveils', 'reveals', 'tanıttı', 'duyurdu', 'çıktı'];
  const updateWords = ['update', 'rollout', 'beta', 'one ui', 'ios', 'android 16', 'windows 11', 'patch', 'security'];
  const aiWords = ['ai', 'yapay zeka', 'chatgpt', 'gemini', 'copilot', 'claude', 'openai'];
  const urgencyWords = ['today', 'now', 'bugün', 'şimdi', 'son dakika', 'breaking'];

  if (strongBrands.some((w) => t.includes(w))) {
    traffic += 14;
    discover += 12;
    editorial += 10;
  }

  if (dealWords.some((w) => t.includes(w))) {
    conversion += 30;
    traffic += 14;
    discover += 6;
    contentType = 'deal';
  }

  if (launchWords.some((w) => t.includes(w))) {
    traffic += 16;
    social += 16;
    discover += 12;
    editorial += 6;
    contentType = 'launch';
  }

  if (updateWords.some((w) => t.includes(w))) {
    traffic += 12;
    discover += 12;
    social += 10;
    editorial += 6;
    contentType = 'update';
  }

  if (aiWords.some((w) => t.includes(w))) {
    discover += 12;
    social += 10;
    traffic += 8;
    editorial += 6;
  }

  if (urgencyWords.some((w) => t.includes(w))) {
    discover += 8;
    traffic += 8;
    social += 6;
  }

  if (/\b(2022|2023|2024)\b/.test(t)) {
    traffic -= 24;
    conversion -= 12;
    discover -= 18;
    social -= 12;
    editorial -= 12;
  }

  const blacklist = [
    'affiliate', 'grammarly', 'commission junction', 'plr',
    'email marketing', 'how i get free traffic', 'best wordpress plugin'
  ];

  if (blacklist.some((w) => t.includes(w))) {
    traffic -= 35;
    conversion -= 35;
    discover -= 35;
    social -= 20;
    editorial -= 25;
  }

  if (publishedAt) {
    const publishedMs = new Date(publishedAt).getTime();
    if (Number.isFinite(publishedMs)) {
      const ageHours = (Date.now() - publishedMs) / (1000 * 60 * 60);
      if (ageHours <= 12) {
        traffic += 10;
        discover += 12;
        social += 8;
      } else if (ageHours <= 24) {
        traffic += 8;
        discover += 8;
        social += 6;
      } else if (ageHours <= 72) {
        traffic += 4;
        discover += 4;
      } else if (ageHours > 720) {
        traffic -= 18;
        discover -= 18;
        social -= 10;
      }
    }
  }

  traffic = clamp(traffic);
  conversion = clamp(conversion);
  discover = clamp(discover);
  social = clamp(social);
  editorial = clamp(editorial);

  const total = clamp(
    traffic * 0.28 +
    conversion * 0.18 +
    discover * 0.24 +
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
      .limit(1000);

    if (error) return json(res, 500, { error: error.message });

    const { data: sources } = await supabase
      .from('sources')
      .select('id,name');
    const sourceMap = new Map((sources || []).map((s) => [String(s.id), s.name || '']));

    let processed = 0;
    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const row of rows || []) {
      const scores = scoreTitle(row.title || '', row.published_at || row.created_at || null);
      const url = row.url || row.canonical_url || '';
      const title = row.title || '';
      const candidate_hash = hashValue(`${title}|${url}`);

      const payload = {
        raw_feed_item_id: row.id,
        source_id: row.source_id || null,
        source_name: sourceMap.get(String(row.source_id || '')) || row.source_name || '',
        title,
        summary: row.summary || '',
        url,
        image_url: row.image_url || null,
        candidate_hash,
        content_type_hint: scores.content_type_hint,
        total_score: scores.total_score,
        traffic_score: scores.traffic_score,
        conversion_score: scores.conversion_score,
        discover_score: scores.discover_score,
        social_score: scores.social_score,
        editorial_score: scores.editorial_score,
        status: 'active',
        published_at: row.published_at || null,
        updated_at: nowIso()
      };

      const { data: existing, error: existingError } = await supabase
        .from('topic_candidates')
        .select('id')
        .eq('raw_feed_item_id', row.id)
        .limit(1);

      if (existingError) {
        errors.push(existingError.message);
        continue;
      }

      if (existing && existing.length > 0) {
        const { error: updateError } = await supabase
          .from('topic_candidates')
          .update(payload)
          .eq('raw_feed_item_id', row.id);

        if (!updateError) {
          processed += 1;
          updated += 1;
        } else {
          errors.push(updateError.message);
        }
      } else {
        const { error: insertError } = await supabase
          .from('topic_candidates')
          .insert({ ...payload, created_at: nowIso() });

        if (!insertError) {
          processed += 1;
          inserted += 1;
        } else {
          errors.push(insertError.message);
        }
      }
    }

    return json(res, 200, {
      ok: true,
      processed,
      inserted,
      updated,
      errors: [...new Set(errors)].slice(0, 10),
      finished_at: nowIso()
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), finished_at: nowIso() });
  }
}
