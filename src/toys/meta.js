// Names, hints and style colors for every toy, in one place.
// Languages: en, vi, es, pt, fr, de, id, it, tr, ru.

export const VARIANT_COSTS = [0, 5, 12, 20, 30, 45];

const L = (en, vi, es, pt, fr, de, id, it, tr, ru) => ({ en, vi, es, pt, fr, de, id, it, tr, ru });

export const TOY_META = {
  popit: {
    title: L('Pop It', 'Pop It', 'Pop It', 'Pop It', 'Pop It', 'Pop It', 'Pop It', 'Pop It', 'Pop It', 'Поп-ит'),
    hint: L('Tap or swipe across the bubbles', 'Chạm hoặc vuốt qua các bong bóng', 'Toca o desliza sobre las burbujas', 'Toque ou deslize pelas bolhas', 'Touche ou glisse sur les bulles', 'Tippe oder wische über die Blasen', 'Ketuk atau geser di atas gelembung', 'Tocca o scorri sulle bolle', 'Baloncuklara dokun veya kaydır', 'Нажимай или проводи по пузырькам'),
    colors: ['#ff4d6d', '#ff8fab', '#ffbe0b', '#0096c7', '#70e000', '#9d4edd'],
  },
  spinner: {
    title: L('Fidget Spinner', 'Con quay', 'Spinner', 'Spinner', 'Hand spinner', 'Fidget Spinner', 'Spinner', 'Spinner', 'Stres Çarkı', 'Спиннер'),
    hint: L('Swipe to spin it!', 'Vuốt để quay!', '¡Desliza para girarlo!', 'Deslize para girar!', 'Glisse pour le faire tourner !', 'Wische, um ihn zu drehen!', 'Geser untuk memutar!', 'Scorri per farlo girare!', 'Döndürmek için kaydır!', 'Проведи, чтобы раскрутить!'),
    colors: ['#18c6c6', '#ff5fa2', '#6a4cff', '#f5b700', '#ff6b35', '#3ddc84'],
  },
  bubblewrap: {
    title: L('Bubble Wrap', 'Xốp nổ', 'Plástico de burbujas', 'Plástico bolha', 'Papier bulle', 'Luftpolsterfolie', 'Plastik Gelembung', 'Pluriball', 'Balonlu Naylon', 'Пупырка'),
    hint: L('Pop every bubble!', 'Bóp vỡ hết bong bóng!', '¡Revienta todas las burbujas!', 'Estoure todas as bolhas!', 'Éclate toutes les bulles !', 'Lass jede Blase platzen!', 'Pecahkan semua gelembung!', 'Scoppia tutte le bolle!', 'Tüm baloncukları patlat!', 'Лопни все пузырьки!'),
    colors: ['#bfe3ff', '#a8f0d1', '#ffc2dc', '#ffd76e', '#c9b6ff', '#ff9f1c'],
  },
  slime: {
    title: L('Slime', 'Slime', 'Slime', 'Slime', 'Slime', 'Schleim', 'Slime', 'Slime', 'Slime', 'Слайм'),
    hint: L('Poke, squish and stretch', 'Chọc, bóp và kéo dãn', 'Pincha, aplasta y estira', 'Cutuque, aperte e estique', 'Appuie, écrase et étire', 'Drücken, quetschen, ziehen', 'Tekan, remas, dan tarik', 'Premi, schiaccia e allunga', 'Dürt, sık ve uzat', 'Тыкай, мни и растягивай'),
    colors: ['#ff8fcf', '#4cc9f0', '#9ef01a', '#5a189a', '#ffd166', '#ff70a6'],
  },
  switches: {
    title: L('Switch Board', 'Bảng công tắc', 'Interruptores', 'Interruptores', 'Interrupteurs', 'Schalterbrett', 'Papan Saklar', 'Interruttori', 'Düğme Paneli', 'Переключатели'),
    hint: L('Flip, press and turn everything', 'Gạt, bấm và xoay mọi thứ', 'Pulsa, gira y enciende todo', 'Aperte, gire e ligue tudo', 'Appuie, tourne, allume tout', 'Drücke, drehe und schalte alles', 'Tekan, putar, dan nyalakan semua', 'Premi, gira e accendi tutto', 'Her şeye bas, çevir ve aç', 'Нажимай, крути и щёлкай всё'),
    colors: ['#5ad1b3', '#f2e3c6', '#22223b', '#ff8fab', '#3a86ff', '#14213d'],
  },
  xylophone: {
    title: L('Xylophone', 'Đàn gõ', 'Xilófono', 'Xilofone', 'Xylophone', 'Xylophon', 'Xilofon', 'Xilofono', 'Ksilofon', 'Ксилофон'),
    hint: L('Tap the bars to play music', 'Gõ vào phím để chơi nhạc', 'Toca las barras para hacer música', 'Toque nas barras para fazer música', 'Touche les lames pour jouer', 'Tippe auf die Klangstäbe', 'Ketuk bilahnya untuk bermain musik', 'Tocca le barre per suonare', 'Müzik için çubuklara dokun', 'Нажимай на пластинки, чтобы играть'),
    colors: ['#ff4d6d', '#ffc8dd', '#c68b59', '#bde0fe', '#ffd23f', '#9b5de5'],
  },
  sand: {
    title: L('Kinetic Sand', 'Cát động lực', 'Arena kinética', 'Areia cinética', 'Sable cinétique', 'Kinetischer Sand', 'Pasir Kinetik', 'Sabbia cinetica', 'Kinetik Kum', 'Кинетический песок'),
    hint: L('Swipe across the sand to slice it', 'Vuốt ngang để cắt cát', 'Desliza sobre la arena para cortarla', 'Deslize na areia para cortar', 'Glisse sur le sable pour le couper', 'Wische über den Sand, um ihn zu schneiden', 'Geser di pasir untuk memotong', 'Scorri sulla sabbia per tagliarla', 'Kesmek için kumun üzerinde kaydır', 'Проведи по песку, чтобы разрезать'),
    colors: ['#ffadad', '#48cae4', '#ff7b54', '#95d5b2', '#7b2cbf', '#f72585'],
  },
  balloons: {
    title: L('Balloon Pop', 'Bóng bay', 'Globos', 'Balões', 'Ballons', 'Ballons', 'Balon', 'Palloncini', 'Balon Patlat', 'Шарики'),
    hint: L('Pop the balloons!', 'Bắn vỡ bóng bay!', '¡Revienta los globos!', 'Estoure os balões!', 'Éclate les ballons !', 'Lass die Ballons platzen!', 'Pecahkan balonnya!', 'Scoppia i palloncini!', 'Balonları patlat!', 'Лопай шарики!'),
    colors: ['#ff4d6d', '#ff8fab', '#ffd23f', '#cdb4db', '#a2d2ff', '#f5b700'],
  },
  drums: {
    title: L('Drum Pads', 'Trống điện tử', 'Batería', 'Bateria', 'Pads de batterie', 'Drum Pads', 'Drum Pad', 'Drum Pad', 'Davul Pedi', 'Драм-пэды'),
    hint: L('Tap the pads to make a beat', 'Gõ các phím để tạo nhịp', 'Toca los pads para crear un ritmo', 'Toque nos pads para criar um ritmo', 'Touche les pads pour créer un rythme', 'Tippe auf die Pads für einen Beat', 'Ketuk pad untuk membuat irama', 'Tocca i pad per creare un ritmo', 'Ritim için pedlere dokun', 'Нажимай на пэды и создавай бит'),
    colors: ['#ff006e', '#3ddc84', '#c8a2c8', '#4cc9f0', '#8338ec', '#ffd23f'],
  },
  spinart: {
    title: L('Spin Art', 'Vẽ xoay', 'Arte giratorio', 'Arte giratória', 'Peinture tournante', 'Drehkunst', 'Lukis Putar', 'Spin Art', 'Döner Sanat', 'Спин-арт'),
    hint: L('Hold on the spinning paper to drip paint', 'Giữ tay trên giấy xoay để nhỏ màu', 'Mantén pulsado sobre el papel para echar pintura', 'Segure no papel girando para pingar tinta', 'Maintiens sur le papier pour verser la peinture', 'Halte auf das Papier, um Farbe zu tropfen', 'Tahan di kertas berputar untuk meneteskan cat', 'Tieni premuto sulla carta per versare colore', 'Boya damlatmak için dönen kâğıda bas', 'Удерживай палец на бумаге, чтобы капать краской'),
    colors: ['#ff006e', '#ffafcc', '#0096c7', '#ff7b00', '#3c096c', '#d4af37'],
  },
  zen: {
    title: L('Zen Garden', 'Vườn thiền', 'Jardín zen', 'Jardim zen', 'Jardin zen', 'Zen-Garten', 'Taman Zen', 'Giardino zen', 'Zen Bahçesi', 'Сад дзен'),
    hint: L('Drag to rake the sand', 'Kéo để cào cát', 'Arrastra para rastrillar la arena', 'Arraste para rastelar a areia', 'Glisse pour ratisser le sable', 'Ziehe, um den Sand zu harken', 'Seret untuk menggaruk pasir', 'Trascina per rastrellare la sabbia', 'Kumu taramak için sürükle', 'Води пальцем, чтобы рисовать граблями'),
    colors: ['#e9d8a6', '#f8f9fa', '#343a40', '#ffc8dd', '#1d3557', '#e76f51'],
  },
  cradle: {
    title: L("Newton's Cradle", 'Con lắc Newton', 'Péndulo de Newton', 'Pêndulo de Newton', 'Pendule de Newton', 'Kugelstoßpendel', 'Bandul Newton', 'Pendolo di Newton', 'Newton Beşiği', 'Маятник Ньютона'),
    hint: L('Pull a ball and let go', 'Kéo một quả bóng rồi thả ra', 'Tira de una bola y suéltala', 'Puxe uma bola e solte', 'Tire une bille et lâche-la', 'Zieh eine Kugel und lass los', 'Tarik bola lalu lepaskan', 'Tira una sfera e lasciala', 'Bir topu çek ve bırak', 'Оттяни шарик и отпусти'),
    colors: ['#c0c0c0', '#f5b700', '#4cc9f0', '#ff00e5', '#ff7b00', '#ff8fab'],
  },
};
