// ==========================================
// ВСТАВЬТЕ СЮДА ВАШ YOUTUBE API КЛЮЧ
// ==========================================
const YOUTUBE_API_KEY = 'AIzaSyAEPjZ9Qd2wq78pjV1cDgBMq6lmFs-hAuk'; 

let peer = new Peer(); 
let conn; 
let player;
let isRemoteAction = false; 
let remoteActionTimeout; // Таймер для защиты от двойных срабатываний

// --- Инициализация PeerJS ---
peer.on('open', (id) => {
  document.getElementById('my-id').innerText = id;
});

// Когда кто-то подключается к нам (Мы - Хост)
peer.on('connection', (connection) => {
  conn = connection;
  setupConnection();

  // ИСПРАВЛЕНИЕ 2: Авто-синхронизация гостя при его подключении
  conn.on('open', () => {
    if (player && typeof player.getVideoData === 'function') {
      const currentVideo = player.getVideoData().video_id;
      if (currentVideo && currentVideo !== 'M7lc1UVf-VE') { // Если смотрим не дефолтное видео
        const currentTime = player.getCurrentTime();
        const isPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
        
        // Отправляем гостю текущую картину
        conn.send({ 
          type: 'SYNC_ON_CONNECT', 
          videoId: currentVideo, 
          time: currentTime,
          play: isPlaying
        });
      }
    }
  });
});

// Когда мы подключаемся к другу (Мы - Гость)
document.getElementById('connect-btn').addEventListener('click', () => {
  const peerId = document.getElementById('peer-id-input').value;
  if (peerId) {
    conn = peer.connect(peerId);
    setupConnection();
  }
});

function setupConnection() {
  conn.on('open', () => {
    document.getElementById('status').innerHTML = '🟢 Подключено';
    addChatMessage('Система', 'Соединение установлено!', 'system');
  });

  conn.on('data', (data) => {
    if (data.type === 'CHAT') {
      addChatMessage('Друг', data.text, 'other');
    } else {
      handleVideoSyncCommand(data);
    }
  });

  conn.on('close', () => {
    document.getElementById('status').innerHTML = '🔴 Отключен';
    addChatMessage('Система', 'Собеседник отключился.', 'system');
    conn = null;
  });
}

// --- Инициализация YouTube API ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    // ИСПРАВЛЕНИЕ 3: Ставим техническое видео-заглушку от Google, чтобы API не выдавал ошибку
    videoId: 'M7lc1UVf-VE', 
    playerVars: { 'autoplay': 0, 'controls': 1, 'rel': 0 },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerStateChange(event) {
  // ИСПРАВЛЕНИЕ 1: Игнорируем события, если они вызваны удаленной командой
  if (isRemoteAction) return;
  if (!conn || !conn.open) return;

  const currentTime = player.getCurrentTime();

  if (event.data === YT.PlayerState.PLAYING) {
    conn.send({ type: 'PLAY', time: currentTime });
  } else if (event.data === YT.PlayerState.PAUSED) {
    conn.send({ type: 'PAUSE', time: currentTime });
  }
}

function handleVideoSyncCommand(data) {
  // Включаем «щит» на 1 секунду. В течение этой секунды наши собственные 
  // изменения плеера не будут отправляться обратно другу (защита от эхо-эффекта)
  isRemoteAction = true;
  clearTimeout(remoteActionTimeout);
  remoteActionTimeout = setTimeout(() => { isRemoteAction = false; }, 1000);

  document.getElementById('player-overlay').style.display = 'none';

  if (data.type === 'PLAY') {
    if (Math.abs(player.getCurrentTime() - data.time) > 1.5) {
      player.seekTo(data.time, true);
    }
    player.playVideo();
  } 
  else if (data.type === 'PAUSE') {
    player.seekTo(data.time, true);
    player.pauseVideo();
  } 
  else if (data.type === 'CHANGE_VIDEO') {
    player.loadVideoById(data.videoId);
    addChatMessage('Система', 'Собеседник включил новое видео', 'system');
  }
  else if (data.type === 'SYNC_ON_CONNECT') {
    // Обработка данных от хоста при первичном подключении
    player.loadVideoById(data.videoId, data.time);
    if (data.play) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
    addChatMessage('Система', 'Синхронизация с хостом завершена', 'system');
  }
}

// --- Поиск видео ---
document.getElementById('search-btn').addEventListener('click', () => {
  const query = document.getElementById('search-input').value;
  if (!query) return;
  
  if (YOUTUBE_API_KEY === 'ВСТАВЬТЕ_СЮДА_ВАШ_КЛЮЧ_API') {
    alert("Ошибка: Вы не вставили YouTube API Ключ в script.js");
    return;
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}&type=video&maxResults=10`;

  fetch(url)
    .then(response => response.json())
    .then(data => displaySearchResults(data.items))
    .catch(err => {
      console.error('Ошибка поиска:', err);
      alert('Ошибка при поиске. Проверьте правильность API ключа.');
    });
});

function displaySearchResults(videos) {
  const container = document.getElementById('search-results');
  container.innerHTML = ''; 

  if (!videos) {
    container.innerHTML = '<p style="padding:10px;">Ничего не найдено или лимит API исчерпан.</p>';
    return;
  }

  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <img src="${video.snippet.thumbnails.medium.url}" alt="thumbnail">
      <h4>${video.snippet.title}</h4>
    `;
    
    card.addEventListener('click', () => {
      document.getElementById('player-overlay').style.display = 'none';
      player.loadVideoById(video.id.videoId);
      
      if (conn && conn.open) {
        conn.send({ type: 'CHANGE_VIDEO', videoId: video.id.videoId });
      }
    });

    container.appendChild(card);
  });
}

// --- Чат ---
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  addChatMessage('Вы', text, 'self');
  input.value = '';

  if (conn && conn.open) {
    conn.send({ type: 'CHAT', text: text });
  } else {
    addChatMessage('Система', 'Сообщение не отправлено. Вы не подключены.', 'system');
  }
}

function addChatMessage(sender, text, type) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${type}`;
  msgDiv.innerText = text;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight; // Автоскролл вниз
}
