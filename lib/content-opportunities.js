const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

export function contentOpportunitiesFor(story = {}) {
  const title = String(story.title || '');
  const text = `${title} ${story.summary || ''}`;
  const signals = story.signals || {};
  const sourceCount = Math.max(0, Number(story.source_count) || 0);
  const score = Math.max(0, Number(story.score) || 0);
  const fresh = Math.max(0, Number(signals.freshness) || 0);
  const quality = Math.max(0, Number(signals.source_quality) || 0);
  const turkey = Math.max(0, Number(signals.turkey_interest) || 0);
  const formats = [];
  const add = (key, label, confidence, reason, checks = []) => formats.push({ key, label, confidence: clamp(confidence), reason, checks });

  if (story.published_match) {
    add('update', 'Mevcut yazıyı güncelle', 72 + Math.min(16, sourceCount * 5),
      'Teknoblog’da ilişkili bir yayın bulundu; yeni ayrıntı varsa mevcut yazı güçlendirilebilir.',
      ['Yeni bilgi ile mevcut yazı arasındaki farkı doğrula.']);
  } else if (fresh >= 45 && quality >= 50 && score >= 55) {
    add('news', 'Haber', score + (sourceCount >= 2 ? 8 : 0),
      sourceCount >= 2 ? `${sourceCount} ayrı akış kaynağı konuyu işledi; ortak kökenleri kontrol edilmeli.` : 'Güncel konu güçlü kaynak ve editoryal puan taşıyor.',
      sourceCount < 2 ? ['Resmî veya ikinci bir kaynakla temel iddiayı doğrula.'] : []);
  }

  const software = /uygulama|özellik|güncelleme|arayüz|android|ios\b|windows|macos|whatsapp|instagram|youtube|chatgpt|gemini|app\b|feature|update|rollout|setting|interface/i.test(text);
  const actionable = /nasıl|rehber|kullan|açıl|aktif|özellik|güncelleme|ayar|how to|enable|use\b|feature|rollout|available/i.test(title)
    && !/keynote|livestream|live stream|etkinlik|canlı yayın/i.test(title);
  if (software && actionable && quality >= 48) {
    add('guide', 'İpucu / rehber', 57 + Math.min(20, score * .2) + (turkey >= 60 ? 5 : 0),
      'Kullanıcıya uygulanabilir bir özellik veya güncelleme sinyali var.',
      ['Özelliğin Türkiye’de ve hangi sürümlerde kullanılabildiğini doğrula.', 'Adımları gerçek cihaz veya resmî kılavuzla kontrol et.']);
  }

  if (/karşılaştır|kıyas|versus|\bvs\.?\b|compare|comparison/i.test(title) && quality >= 50) {
    add('comparison', 'Karşılaştırma', 62 + Math.min(18, score * .2),
      'Kaynak başlığı açık bir karşılaştırma açısı taşıyor.',
      ['Karşılaştırılan iki ürün veya sürümün doğrulanmış verilerini topla.']);
  }

  const visual = /tasarım|renk|kamera|ekran|arayüz|fotoğraf|görsel|tasarlandı|color|camera|display|screen|hands.on|look/i.test(title);
  if (story.image_url && visual && quality >= 55) {
    add('short_video', 'Kısa video', 58 + Math.min(18, score * .2),
      'Görselle anlatılabilecek ürün veya arayüz ayrıntısı ve kullanılabilir görsel bağlantısı var.',
      ['Görselin kullanım iznini ve video için yeterli materyali kontrol et.']);
  }

  if (story.image_url && /özellikler|teknik|model|seri|renk|fotoğraf|specs|features|models|colors/i.test(title) && quality >= 55) {
    add('carousel', 'Karusel', 54 + Math.min(16, score * .2),
      'Birden fazla özelliği görsellerle ayrı kartlarda anlatma fırsatı var.',
      ['Her kart için doğrulanmış özellik ve uygun görsel bul.']);
  }

  const buying = /fiyat|indirim|kampanya|satış|stok|price|discount|deal|sale|available to buy/i.test(text);
  const product = /telefon|tablet|laptop|bilgisayar|kulaklık|akıllı saat|kamera|phone|headphones|watch|console/i.test(text);
  if (buying && product && turkey >= 60 && quality >= 55) {
    add('affiliate', 'Satın alma fırsatı', 54 + Math.min(20, score * .25),
      'Türkiye ilgisi taşıyan ürün ve fiyat sinyali birlikte görünüyor.',
      ['Türkiye fiyatını, stok durumunu ve bağlantı koşullarını güncel olarak doğrula.']);
  }

  if (sourceCount >= 2 && /düzenleme|yasa|rekabet|gizlilik|güvenlik|strateji|antitröst|regulation|privacy|security|policy|antitrust/i.test(text) && score >= 55) {
    add('podcast', 'Podcast konusu', 52 + Math.min(20, sourceCount * 5),
      'Birden fazla kaynağa yayılan ve açıklama gerektiren sektör etkisi var.',
      ['Karşıt görüşleri ve resmî açıklamayı araştır.']);
  }

  const order = ['update', 'news', 'guide', 'comparison', 'short_video', 'carousel', 'affiliate', 'podcast'];
  formats.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return formats.slice(0, 5);
}
