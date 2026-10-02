function slugify(value) {
  return String(value || '').toLocaleLowerCase('tr-TR')
    .replace(/[ığüşöç]/g, (char) => ({ ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' }[char]))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '');
}

function compactTitle(title, limit = 76) {
  if (title.length <= limit) return title;
  const fragment = title.slice(0, limit + 1);
  const wordBreak = fragment.lastIndexOf(' ');
  return fragment.slice(0, wordBreak > limit * .6 ? wordBreak : limit).trim();
}

export function editorialPackageFor(story = {}) {
  const title = String(story.title || '').trim();
  if (!title) return null;
  const research = story.research || {};
  const uncertain = /iddia|sızıntı|söylenti|rumou?r|leak/i.test(title);
  const shortened = compactTitle(title);
  const core = uncertain && !/iddia|sızıntı|söylenti|rumou?r|leak/i.test(shortened) ? `İddia: ${shortened}` : shortened;
  const hasPublishedMatch = Boolean(story.published_match);
  const headlineDrafts = [
    { angle: 'Kaynağa yakın', text: title },
    { angle: 'Açıklayıcı', text: `${core}: kaynakların aktardıkları ve açık sorular` },
    { angle: hasPublishedMatch ? 'Güncelleme' : 'Türkiye açısı',
      text: `${core}: ${hasPublishedMatch ? 'mevcut haberde ne güncellendi?' : 'Türkiye için yanıt bekleyen sorular'}` }
  ];
  const metaShort = compactTitle(title, 85);
  const metaCore = uncertain && !/iddia|sızıntı|söylenti|rumou?r|leak/i.test(metaShort) ? `İddia: ${metaShort}` : metaShort;
  const metaDescription = `${metaCore}. Kaynakları, doğrulama durumunu ve Türkiye açısından açık soruları inceleyin.`;
  const issues = [...(research.checks || [])];
  if ((research.possible_discrepancies || []).length) issues.unshift('Kaynak başlıklarında farklı sayılar var; ürün ve sürüm eşleşmesini doğrula.');
  return {
    status: 'editor_review_required',
    basis: 'Yalnızca izlenen kaynak başlıkları ve kayıtlı sinyaller kullanıldı.',
    headline_drafts: headlineDrafts,
    seo_title_draft: title,
    seo_title_length: title.length,
    slug_draft: slugify(title),
    meta_description_draft: metaDescription,
    social_draft: `${title}\nKaynaklar ve ayrıntılar editör doğrulamasında.`,
    image: story.image_url ? { url: story.image_url, rights_verified: false } : null,
    existing_article: story.published_match || null,
    before_publish: [...new Set(issues)]
  };
}
