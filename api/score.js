const { json, getSupabase, stripHtml, nowIso } = require('./_lib');

const BRANDS = ['apple','google','samsung','microsoft','meta','openai','intel','qualcomm','xiaomi','huawei','oneplus','asus','nvidia','amd','sony'];
const KEYWORDS = ['iphone','galaxy','android','windows','chrome','gemini','chatgpt','one ui','wear os','copilot','ipad','pixel','tesla','ev','fold','watch'];
const BLACKLIST = ['affiliate','grammarly','commission junction','plr','email marketing','content creator tools','blogger','how i get free traffic','best wordpress plugin'];
const DEAL_WORDS = ['price','fiyat','discount','indirim','sale','campaign','kampanya','coupon','kupon','preorder','ön sipariş'];
const GUIDE_WORDS = ['how to','nasıl','guide','rehber','tips','ipuçları','vs','karşılaştırma','comparison'];
const HOT_WORDS = ['launch','announced','duyurdu','rolling out','gets','update','güncelleme','released','tanıttı'];

function scoreItem(item) {
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  let traffic = 18;
  let conversion = 8;
  let discover = 14;
  let social = 10;
  let editorial = 12;

  if (BRANDS.some((b) => text.includes(b))) editorial += 10;
  if (KEYWORDS.some((k) => text.includes(k))) traffic += 10;
  if (DEAL_WORDS.some((k) => text.includes(k))) conversion += 18;
  if (GUIDE_WORDS.some((k) => text.includes(k))) discover += 12;
  if (HOT_WORDS.some((k) => text.includes(k))) social += 10;

  if (/2022|2023|2024/i.test(text)) {
    traffic -= 20;
    discover -= 20;
    editorial -= 25;
  }

  if (BLACKLIST.some((k) => text.includes(k))) {
    traffic -= 30;
    conversion -= 15;
    discover -= 20;
    editorial -= 30;
  }

  const agePenalty = item.published_at ? Math.max(0, Math.floor((Date.now() - new Date(item.published_at).getTime()) / 86400000) - 7) : 0;
  if (agePenalty > 0) {
    traffic -= Math.min(agePenalty, 20);
    social -= Math.min(agePenalty, 15);
  }

  traffic = Math.max(0, Math.min(100, traffic));
  conversion = Math.max(0, Math.min(100, conversion));
  discover = Math.max(0, Math.min(100, discover));
  social = Math.max(0, Math.min(100, social));
  editorial = Math.max(0, Math.min(100, editorial));

  const total = Math.round((traffic * 0.30) + (conversion * 0.20) + (discover * 0.20) + (social * 0.10) + (editorial * 0.20));

  let contentType = 'analysis';
  if (DEAL_WORDS.some((k) => text.includes(k))) contentType = 'deal';
  else if (GUIDE_WORDS.some((k) => text.includes(k))) contentType = text.includes('vs') || text.includes('comparison') ? 'comparison' : 'guide';
  else if (HOT_WORDS.some((k) => text.includes(k))) contentType = 'hot_news';
  else if (text.includes('launch') || text.includes('tanıttı')) contentType = 'launch';
  else if (text.includes('update') || text.includes('güncelleme')) contentType = 'update';

  return { total, traffic, conversion, discover, social, editorial, contentType };
}

module.exports = async (req, res) => {
  try {
    const supabase = await getSupabase();

    const { data: rawItems, error } = await supabase
      .from('raw_feed_items')
      .select('id,source_id,title,url,canonical_url,summary,image_url,published_at,content_hash')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    let processed = 0;

    for (const item of rawItems || []) {
      const scoring = scoreItem(item);
      const row = {
        raw_feed_item_id: item.id,
        source_id: item.source_id,
        title: stripHtml(item.title || ''),
        summary: stripHtml(item.summary || ''),
        url: item.url,
        image_url: item.image_url,
        published_at: item.published_at,
        content_type_hint: scoring.contentType,
        total_score: scoring.total,
        traffic_score: scoring.traffic,
        conversion_score: scoring.conversion,
        discover_score: scoring.discover,
        social_score: scoring.social,
        editorial_score: scoring.editorial,
        status: 'active',
        updated_at: nowIso(),
      };

      const { error: upsertError } = await supabase
        .from('topic_candidates')
        .upsert(row, { onConflict: 'raw_feed_item_id', ignoreDuplicates: false });

      if (!upsertError) processed += 1;
    }

    await supabase.from('pipeline_runs').insert({
      status: 'finished',
      ingested_count: 0,
      processed_count: processed,
      notes: 'Score endpoint completed',
      finished_at: nowIso(),
    });

    return json(res, 200, { ok: true, processed, finished_at: nowIso() });
  } catch (error) {
    return json(res, 500, { error: error.message, finished_at: nowIso() });
  }
};
