-- Ham feed verisini manuel temizleme
select cleanup_old_data();

-- Son 20 aktif aday
select id, title, total_score, updated_at
from topic_candidates
where status = 'active'
order by total_score desc, updated_at desc
limit 20;

-- Eski adayları görmek için
select id, title, status, updated_at
from topic_candidates
where updated_at < now() - interval '90 days'
order by updated_at asc;
