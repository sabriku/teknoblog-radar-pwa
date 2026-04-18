const { json, getSupabase } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const supabase = await getSupabase();
    const sortBy = req.query?.sortBy || 'total_score';
    const orderBy = ['total_score','traffic_score','conversion_score','discover_score','social_score','editorial_score','published_at'].includes(sortBy)
      ? sortBy
      : 'total_score';
    const minScore = Number(req.query?.minScore || 0);
    const contentType = req.query?.contentType || 'all';

    let query = supabase
      .from('topic_candidates')
      .select('id,title,summary,url,image_url,content_type_hint,total_score,traffic_score,conversion_score,discover_score,social_score,editorial_score,published_at,updated_at,status')
      .eq('status', 'active')
      .gte('total_score', minScore)
      .order(orderBy, { ascending: false })
      .limit(200);

    if (contentType !== 'all') query = query.eq('content_type_hint', contentType);

    const { data, error } = await query;
    if (error) throw error;

    return json(res, 200, { items: data || [] });
  } catch (error) {
    return json(res, 500, { error: `Supabase error: ${error.message}` });
  }
};
