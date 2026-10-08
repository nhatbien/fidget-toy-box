// UI strings. English is required by YouTube Playables; others are picked from the host language.
// Toy-specific strings live inside each toy as { en, vi, es, ... } objects passed to app.tr().

export const LANGS = ['en', 'vi', 'es', 'pt', 'fr', 'de', 'id', 'it', 'tr', 'ru'];

export function pickLang(tag) {
  const base = String(tag || 'en').toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(base) ? base : 'en';
}

export const STRINGS = {
  loading: { en: 'Loading…', vi: 'Đang tải…', es: 'Cargando…', pt: 'Carregando…', fr: 'Chargement…', de: 'Lädt…', id: 'Memuat…', it: 'Caricamento…', tr: 'Yükleniyor…', ru: 'Загрузка…' },
  settings: { en: 'Settings', vi: 'Cài đặt', es: 'Ajustes', pt: 'Configurações', fr: 'Réglages', de: 'Einstellungen', id: 'Pengaturan', it: 'Impostazioni', tr: 'Ayarlar', ru: 'Настройки' },
  music: { en: 'Music', vi: 'Nhạc nền', es: 'Música', pt: 'Música', fr: 'Musique', de: 'Musik', id: 'Musik', it: 'Musica', tr: 'Müzik', ru: 'Музыка' },
  sounds: { en: 'Sound effects', vi: 'Hiệu ứng âm thanh', es: 'Efectos de sonido', pt: 'Efeitos sonoros', fr: 'Effets sonores', de: 'Soundeffekte', id: 'Efek suara', it: 'Effetti sonori', tr: 'Ses efektleri', ru: 'Звуковые эффекты' },
  vibration: { en: 'Vibration', vi: 'Rung', es: 'Vibración', pt: 'Vibração', fr: 'Vibration', de: 'Vibration', id: 'Getar', it: 'Vibrazione', tr: 'Titreşim', ru: 'Вибрация' },
  ok: { en: 'OK', vi: 'OK', es: 'OK', pt: 'OK', fr: 'OK', de: 'OK', id: 'OK', it: 'OK', tr: 'Tamam', ru: 'ОК' },
  unlockTitle: { en: 'New style', vi: 'Kiểu mới', es: 'Nuevo estilo', pt: 'Novo estilo', fr: 'Nouveau style', de: 'Neuer Stil', id: 'Gaya baru', it: 'Nuovo stile', tr: 'Yeni stil', ru: 'Новый стиль' },
  unlock: { en: 'Unlock', vi: 'Mở khóa', es: 'Desbloquear', pt: 'Desbloquear', fr: 'Débloquer', de: 'Freischalten', id: 'Buka', it: 'Sblocca', tr: 'Aç', ru: 'Открыть' },
  freeAd: { en: 'Free (ad)', vi: 'Miễn phí (QC)', es: 'Gratis (anuncio)', pt: 'Grátis (anúncio)', fr: 'Gratuit (pub)', de: 'Gratis (Werbung)', id: 'Gratis (iklan)', it: 'Gratis (pubblicità)', tr: 'Ücretsiz (reklam)', ru: 'Бесплатно (реклама)' },
  notNow: { en: 'Not now', vi: 'Để sau', es: 'Ahora no', pt: 'Agora não', fr: 'Plus tard', de: 'Später', id: 'Nanti', it: 'Non ora', tr: 'Şimdi değil', ru: 'Не сейчас' },
  needMore: { en: 'Need {n} more ★ — keep playing!', vi: 'Cần thêm {n} ★ — chơi tiếp nhé!', es: '¡Faltan {n} ★, sigue jugando!', pt: 'Faltam {n} ★, continue jogando!', fr: 'Encore {n} ★, continue à jouer !', de: 'Noch {n} ★ — spiel weiter!', id: 'Butuh {n} ★ lagi, terus main!', it: 'Mancano {n} ★, continua a giocare!', tr: '{n} ★ daha lazım, oynamaya devam!', ru: 'Нужно ещё {n} ★, играй дальше!' },
  unlocked: { en: 'Unlocked!', vi: 'Đã mở khóa!', es: '¡Desbloqueado!', pt: 'Desbloqueado!', fr: 'Débloqué !', de: 'Freigeschaltet!', id: 'Terbuka!', it: 'Sbloccato!', tr: 'Açıldı!', ru: 'Открыто!' },
  noAd: { en: 'No ad available right now', vi: 'Hiện chưa có quảng cáo', es: 'No hay anuncios ahora', pt: 'Nenhum anúncio agora', fr: 'Aucune pub disponible', de: 'Gerade keine Werbung verfügbar', id: 'Iklan belum tersedia', it: 'Nessuna pubblicità ora', tr: 'Şu an reklam yok', ru: 'Реклама недоступна' },
  allUnlocked: { en: 'Everything unlocked! You are a calm master.', vi: 'Đã mở khóa tất cả! Bạn là bậc thầy thư giãn.', es: '¡Todo desbloqueado! Eres un maestro de la calma.', pt: 'Tudo desbloqueado! Você é mestre da calma.', fr: 'Tout est débloqué ! Tu es un maître du calme.', de: 'Alles freigeschaltet! Du bist ein Meister der Ruhe.', id: 'Semua terbuka! Kamu master santai.', it: 'Tutto sbloccato! Sei un maestro della calma.', tr: 'Her şey açıldı! Sen bir sakinlik ustasısın.', ru: 'Всё открыто! Ты мастер спокойствия.' },
  starsInfo: { en: 'Play with the toys to earn ★ and unlock new styles', vi: 'Chơi đồ chơi để nhận ★ và mở khóa kiểu mới', es: 'Juega con los juguetes para ganar ★ y desbloquear estilos', pt: 'Brinque para ganhar ★ e desbloquear estilos', fr: 'Joue avec les jouets pour gagner des ★ et débloquer des styles', de: 'Spiel mit den Spielzeugen, sammle ★ und schalte Stile frei', id: 'Main mainan untuk dapat ★ dan buka gaya baru', it: 'Gioca con i giocattoli per ottenere ★ e sbloccare stili', tr: '★ kazanmak ve yeni stiller açmak için oyna', ru: 'Играй с игрушками, получай ★ и открывай стили' },
  allStyles: { en: 'All styles unlocked', vi: 'Đã mở hết các kiểu', es: 'Todos los estilos desbloqueados', pt: 'Todos os estilos desbloqueados', fr: 'Tous les styles débloqués', de: 'Alle Stile freigeschaltet', id: 'Semua gaya terbuka', it: 'Tutti gli stili sbloccati', tr: 'Tüm stiller açık', ru: 'Все стили открыты' },
  newBadge: { en: 'NEW', vi: 'MỚI', es: 'NUEVO', pt: 'NOVO', fr: 'NOUV.', de: 'NEU', id: 'BARU', it: 'NUOVO', tr: 'YENİ', ru: 'НОВОЕ' },
  credits: { en: 'Font: Baloo 2 (SIL OFL)', vi: 'Phông chữ: Baloo 2 (SIL OFL)', es: 'Fuente: Baloo 2 (SIL OFL)', pt: 'Fonte: Baloo 2 (SIL OFL)', fr: 'Police : Baloo 2 (SIL OFL)', de: 'Schrift: Baloo 2 (SIL OFL)', id: 'Font: Baloo 2 (SIL OFL)', it: 'Font: Baloo 2 (SIL OFL)', tr: 'Yazı tipi: Baloo 2 (SIL OFL)', ru: 'Шрифт: Baloo 2 (SIL OFL)' },
};
