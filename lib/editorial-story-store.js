import { queryLocal, withLocalTransaction } from '../api/_lib.js';

function storedLane(card) { return card.lane || 'watch'; }

export function deriveStoryEvents(cards = [], previous = new Map()) {
  const events = [];
  for (const card of cards) {
    const before = previous.get(card.id);
    const lane = storedLane(card);
    if (!before) {
      events.push({ story_id: card.id, event_type: 'detected', from_lane: null, to_lane: lane, source_count: card.source_count });
      if (card.source_count >= 2) events.push({ story_id: card.id, event_type: 'corroborated', from_lane: null, to_lane: lane, source_count: card.source_count });
      continue;
    }
    if (before.lane !== lane) events.push({ story_id: card.id, event_type: 'lane_changed', from_lane: before.lane, to_lane: lane, source_count: card.source_count });
    if (Number(before.source_count) < 2 && card.source_count >= 2) {
      events.push({ story_id: card.id, event_type: 'corroborated', from_lane: before.lane, to_lane: lane, source_count: card.source_count });
    }
  }
  return events;
}

export async function saveEditorialSnapshot(cards = []) {
  const rows = cards.map((card) => ({
    id: card.id, title: card.title, url: card.url,
    first_seen_at: card.first_seen_at || card.last_seen_at,
    last_seen_at: card.last_seen_at,
    lane: storedLane(card), score: card.score, source_count: card.source_count,
    payload: { signals: card.signals, sources: card.sources, calibration: card.calibration,
      published_match: card.published_match, content_opportunities: card.content_opportunities }
  }));
  return withLocalTransaction(async (query) => {
    await query(`SELECT pg_advisory_xact_lock(hashtext('editorial_story_snapshot'))`);
    const ids = rows.map((row) => row.id);
    const existing = ids.length ? (await query(`SELECT id,lane,source_count FROM editorial_story_clusters WHERE id=ANY($1::text[]) FOR UPDATE`, [ids])).rows : [];
    const previous = new Map(existing.map((row) => [row.id, row]));
    if (rows.length) {
      await query(`INSERT INTO editorial_story_clusters(id,title,url,first_seen_at,last_seen_at,lane,score,source_count,payload,last_recorded_at)
        SELECT x.id,x.title,x.url,x.first_seen_at::timestamptz,x.last_seen_at::timestamptz,x.lane,x.score,x.source_count,x.payload,NOW()
        FROM jsonb_to_recordset($1::jsonb) AS x(id text,title text,url text,first_seen_at text,last_seen_at text,lane text,score integer,source_count integer,payload jsonb)
        ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,
          first_seen_at=LEAST(editorial_story_clusters.first_seen_at,EXCLUDED.first_seen_at),
          last_seen_at=GREATEST(editorial_story_clusters.last_seen_at,EXCLUDED.last_seen_at),
          lane=EXCLUDED.lane,score=EXCLUDED.score,source_count=EXCLUDED.source_count,payload=EXCLUDED.payload,last_recorded_at=NOW()`, [JSON.stringify(rows)]);
    }
    const events = deriveStoryEvents(cards, previous);
    if (events.length) {
      await query(`INSERT INTO editorial_story_events(story_id,event_type,from_lane,to_lane,source_count,payload)
        SELECT x.story_id,x.event_type,x.from_lane,x.to_lane,x.source_count,'{}'::jsonb
        FROM jsonb_to_recordset($1::jsonb) AS x(story_id text,event_type text,from_lane text,to_lane text,source_count integer)`, [JSON.stringify(events)]);
    }
    const removed = await query(`DELETE FROM editorial_story_clusters WHERE last_recorded_at<NOW()-INTERVAL '90 days'`);
    return { observed: rows.length, events: events.length, removed: removed.rowCount, saved_at: new Date().toISOString() };
  });
}

export async function attachStoryHistory(lanes = {}) {
  const ids = [...new Set(Object.values(lanes).flatMap((items) => (items || []).slice(0, 20).map((item) => item.id)))];
  if (!ids.length) return { lanes, recorded_count: 0 };
  const [states, events] = await Promise.all([
    queryLocal(`SELECT id,first_recorded_at,last_recorded_at FROM editorial_story_clusters WHERE id=ANY($1::text[])`, [ids]),
    queryLocal(`SELECT story_id,event_type,from_lane,to_lane,source_count,occurred_at
      FROM editorial_story_events WHERE story_id=ANY($1::text[]) ORDER BY occurred_at DESC,id DESC LIMIT 500`, [ids])
  ]);
  const stateMap = new Map(states.rows.map((row) => [row.id, row]));
  const eventMap = new Map();
  for (const row of events.rows) {
    const list = eventMap.get(row.story_id) || [];
    if (list.length < 5) list.push(row);
    eventMap.set(row.story_id, list);
  }
  return { recorded_count: states.rows.length,
    lanes: Object.fromEntries(Object.entries(lanes).map(([lane, items]) => [lane, items.map((item) => {
      const state = stateMap.get(item.id);
      return state ? { ...item, first_recorded_at: state.first_recorded_at, last_recorded_at: state.last_recorded_at, history: eventMap.get(item.id) || [] } : item;
    })])) };
}
