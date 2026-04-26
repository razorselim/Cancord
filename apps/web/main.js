// main.js - KESİN ÇÖZÜM VERSİYONU
console.log("CANCORD BAŞLATILIYOR");

// ========== LOGIN MÜZİK KONTROLÜ ==========
const bgMusic = document.getElementById('bgMusic');
if (bgMusic) {
  bgMusic.volume = 0.15;
  const startMusic = () => {
    bgMusic.play().catch(e => console.log('Müzik çalışmadı'));
    document.removeEventListener('click', startMusic);
    document.removeEventListener('keydown', startMusic);
  };
  document.addEventListener('click', startMusic);
  document.addEventListener('keydown', startMusic);
}

function stopMusic() {
  const music = document.getElementById('bgMusic');
  if (music) {
    music.pause();
    music.currentTime = 0;
    music.muted = true;
  }
}

// ========== KULLANICI KONTROLÜ ==========
let currentUser = localStorage.getItem('cancord_user');
let socket = null;
const authModal = document.getElementById('authModal');

if (!currentUser) {
  if (authModal) authModal.style.display = 'flex';
} else {
  if (authModal) authModal.style.display = 'none';
  startApp();
}

// ========== KAYIT/GİRİŞ ==========
async function register() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  
  if (data.success) {
    document.getElementById('regError').style.color = '#0f0';
    document.getElementById('regError').textContent = 'Kayıt başarılı! Giriş yapın.';
    setTimeout(() => {
      document.querySelector('[data-tab="login"]').click();
      document.getElementById('regError').textContent = '';
    }, 1500);
  } else {
    document.getElementById('regError').style.color = '#f00';
    document.getElementById('regError').textContent = data.error;
  }
}

async function login() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  
  if (data.success) {
    localStorage.setItem('cancord_user', username);
    currentUser = username;
    authModal.style.display = 'none';
    startApp();
  } else {
    document.getElementById('loginError').textContent = data.error;
  }
}

function logout() {
  localStorage.removeItem('cancord_user');
  if (socket) socket.disconnect();
  location.reload();
}

// Tab geçişleri
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.onclick = () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${target}Panel`).classList.add('active');
    document.getElementById(`${target}Error`).textContent = '';
  };
});

if (document.getElementById('registerBtn')) {
  document.getElementById('registerBtn').onclick = register;
  document.getElementById('loginBtn').onclick = login;
}

// ========== KULLANICI SES KONTROLÜ ==========
let selectedUser = null;
const userAudioElements = new Map();

function showAudioPanel(username) {
  selectedUser = username;
  const panel = document.getElementById('audioPanel');
  if (!panel) return;
  
  document.getElementById('selectedUser').innerHTML = `🎤 ${username}`;
  const audioEl = userAudioElements.get(username);
  
  if (audioEl) {
    const vol = audioEl.volume * 100;
    document.getElementById('volumeSlider').value = vol;
    document.getElementById('volumeValue').innerText = Math.round(vol) + '%';
    const muteBtn = document.getElementById('muteUserBtn');
    if (audioEl.muted) {
      muteBtn.classList.add('muted');
      muteBtn.innerHTML = '🔊 Sesi Aç';
    } else {
      muteBtn.classList.remove('muted');
      muteBtn.innerHTML = '🔇 Sesi Kapat';
    }
  }
  panel.style.display = 'block';
}

function initUserClicks() {
  document.querySelectorAll('#users div').forEach(div => {
    const username = div.textContent.replace('🟢 ', '');
    div.style.cursor = 'pointer';
    div.onclick = () => showAudioPanel(username);
  });
}

setTimeout(() => {
  const volumeSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteUserBtn');
  const closeBtn = document.getElementById('closeAudioPanel');
  
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      document.getElementById('volumeValue').innerText = e.target.value + '%';
      if (selectedUser) {
        const audio = userAudioElements.get(selectedUser);
        if (audio) audio.volume = volume;
      }
    });
  }
  
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (selectedUser) {
        const audio = userAudioElements.get(selectedUser);
        if (audio) {
          audio.muted = !audio.muted;
          if (audio.muted) {
            muteBtn.classList.add('muted');
            muteBtn.innerHTML = '🔊 Sesi Aç';
          } else {
            muteBtn.classList.remove('muted');
            muteBtn.innerHTML = '🔇 Sesi Kapat';
          }
        }
      }
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('audioPanel').style.display = 'none';
    });
  }
}, 100);

// ========== ANA UYGULAMA ==========
function startApp() {
  stopMusic();
  socket = io();
  const username = currentUser;

  const usersEl = document.getElementById("users");
  const messagesEl = document.getElementById("messages");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const micBtn = document.getElementById("micBtn");
  const screenBtn = document.getElementById("screenBtn");
  const screenContainer = document.getElementById("screenContainer");
  let screenVideo = document.getElementById("screenVideo");
  const ROOM_ID = "room-1";

  const logoutBtn = document.createElement('button');
  logoutBtn.textContent = 'ÇIKIŞ';
  logoutBtn.style.cssText = 'background:#ff3333;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;margin-left:10px;';
  logoutBtn.onclick = logout;
  document.querySelector('.logo').appendChild(logoutBtn);

  let localStream = null;
  let peerConnection = null;
  let screenStream = null;
  let isSharingScreen = false;
  let screenSender = null;
  let remoteUsername = null;

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  // Video elementi yeniden oluşturma fonksiyonu
  function resetVideoElement() {
    const parent = screenContainer;
    const oldVideo = screenVideo;
    const noSignalDiv = document.querySelector('.no-signal');
    
    // Yeni video elementi oluştur
    const newVideo = document.createElement('video');
    newVideo.id = 'screenVideo';
    newVideo.autoplay = true;
    newVideo.muted = false;
    newVideo.style.cssText = oldVideo ? oldVideo.style.cssText : '';
    newVideo.style.maxWidth = '100%';
    newVideo.style.maxHeight = '100%';
    newVideo.style.objectFit = 'contain';
    
    // Eskisini kaldır, yenisini ekle
    if (oldVideo) oldVideo.remove();
    parent.appendChild(newVideo);
    
    // Global değişkeni güncelle
    screenVideo = newVideo;
    screenVideo.classList.remove("active");
    screenContainer.classList.remove("active");
    if (noSignalDiv) noSignalDiv.style.display = 'flex';
    
    console.log("🔄 Video elementi yeniden oluşturuldu, NO SIGNAL gösteriliyor");
    return newVideo;
  }

  socket.on("connect", () => {
    socket.emit("room:join", { roomId: ROOM_ID, username });
  });

  socket.on("room:peers", (users) => {
    usersEl.innerHTML = "";
    users.forEach(name => {
      const div = document.createElement("div");
      div.textContent = "🟢 " + name;
      div.id = `user-${name}`;
      usersEl.appendChild(div);
    });
    setTimeout(initUserClicks, 100);
    if (users.length > 1) startCall();
  });

  socket.on("peer:joined", ({ username }) => {
    const div = document.createElement("div");
    div.textContent = "🟢 " + username;
    div.id = `user-${username}`;
    usersEl.appendChild(div);
    setTimeout(initUserClicks, 100);
  });

  socket.on("peer:left", ({ username }) => {
    const userEl = document.getElementById(`user-${username}`);
    if (userEl) userEl.remove();
    userAudioElements.delete(username);
    
    // Paylaşan ayrıldığında video elementi sıfırla
    console.log("🔴 Peer ayrıldı - Video yeniden oluşturuluyor");
    resetVideoElement();
  });

  // EKRAN PAYLAŞIMI DURDURULDU - Video elementi yeniden oluştur
  socket.on("screen_share_stopped", () => {
    console.log("🔔 screen_share_stopped ALINDI! Video yeniden oluşturuluyor...");
    resetVideoElement();
  });

  sendBtn.onclick = () => {
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit("chat:message", { roomId: ROOM_ID, message: msg });
    addMessage("me", msg);
    input.value = "";
  };

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") sendBtn.click();
  });

  socket.on("chat:message", ({ from, message, isHistory }) => {
    if (isHistory) {
      addMessageWithoutSound(from, message);
    } else {
      addMessage(from, message);
    }
  });

  socket.on("chat_history", ({ messages }) => {
    if (messages) {
      messages.forEach(msg => {
        addMessageWithoutSound(msg.username, msg.message);
      });
    }
  });

  socket.on("system:message", ({ text }) => {
    addMessageWithoutSound("system", text);
  });

  socket.on("signal", async ({ data, from }) => {
    if (!peerConnection) await initPeer();
    try {
      if (data.type === "offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { roomId: ROOM_ID, to: from, data: { type: "answer", answer } });
      }
      if (data.type === "answer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
      if (data.type === "ice") {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.error("Signal error:", error);
    }
  });

  async function initPeer() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    } catch (error) {
      console.error("Mic error:", error);
    }

    peerConnection.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;
      
      if (track.kind === "video") {
        screenVideo.srcObject = stream;
        screenVideo.muted = false;
        screenContainer.classList.add("active");
        screenVideo.classList.add("active");
        const noSignalDiv = document.querySelector('.no-signal');
        if (noSignalDiv) noSignalDiv.style.display = 'none';
        
        track.onended = () => {
          console.log("📹 Video track bitti (onended)");
          resetVideoElement();
        };
      }
      
      if (track.kind === "audio") {
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = 0.7;
        audio.style.display = "none";
        document.body.appendChild(audio);
        if (remoteUsername) userAudioElements.set(remoteUsername, audio);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { roomId: ROOM_ID, data: { type: "ice", candidate: event.candidate } });
      }
    };
  }

  async function startCall() {
    if (!peerConnection) await initPeer();
    try {
      const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", { roomId: ROOM_ID, data: { type: "offer", offer } });
    } catch (error) {
      console.error("Start call error:", error);
    }
  }

  screenBtn.onclick = async () => {
    if (isSharingScreen) {
      await stopScreenSharing();
    } else {
      await startScreenSharing();
    }
  };

  async function startScreenSharing() {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: false
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      screenContainer.classList.add("active");
      screenVideo.classList.add("active");
      
      const noSignalDiv = document.querySelector('.no-signal');
      if (noSignalDiv) noSignalDiv.style.display = 'none';
      
      if (!peerConnection) {
        await initPeer();
        await startCall();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const senders = peerConnection.getSenders();
      let videoSender = senders.find(s => s.track?.kind === "video");
      
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        screenSender = videoSender;
      } else {
        screenSender = peerConnection.addTrack(screenTrack, screenStream);
      }
      
      screenBtn.classList.add("active");
      screenBtn.innerHTML = '<span>🔴</span><span>STOP</span>';
      isSharingScreen = true;
      screenTrack.onended = () => stopScreenSharing();
      if (peerConnection.signalingState === "stable") await sendRenegotiationOffer();
    } catch (error) {
      console.error("Screen share error:", error);
    }
  }

  async function stopScreenSharing() {
    console.log("🛑 STOP BUTONUNA BASILDI - SİNYAL GÖNDERİLİYOR...");
    socket.emit("screen_share_stopped", { roomId: ROOM_ID });
    console.log("✅ screen_share_stopped SİNYALİ GÖNDERİLDİ");
    
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    
    resetVideoElement();
    
    if (screenSender) {
      try { await screenSender.replaceTrack(null); } catch (e) {}
    }
    
    screenBtn.classList.remove("active");
    screenBtn.innerHTML = '<span>🖥️</span><span>SHARE</span>';
    isSharingScreen = false;
    screenSender = null;
    
    if (peerConnection?.signalingState === "stable") {
      await sendRenegotiationOffer();
    }
  }

  async function sendRenegotiationOffer() {
    if (!peerConnection || peerConnection.signalingState !== "stable") return;
    try {
      const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", { roomId: ROOM_ID, data: { type: "offer", offer: peerConnection.localDescription } });
    } catch (error) {
      console.error("Renegotiation error:", error);
    }
  }

  function displayRemoteScreen(stream, username) {
    remoteUsername = username;
    screenVideo.srcObject = stream;
    screenVideo.muted = false;
    screenContainer.classList.add("active");
    screenVideo.classList.add("active");
    const noSignalDiv = document.querySelector('.no-signal');
    if (noSignalDiv) noSignalDiv.style.display = 'none';
  }

  micBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    micBtn.classList.toggle("active", track.enabled);
    micBtn.innerHTML = track.enabled ? '<span>🎤</span><span>ON</span>' : '<span>🎤</span><span>OFF</span>';
  };

  function playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const freq = Math.floor(Math.random() * (2000 - 300 + 1) + 300);
      const duration = Math.random() * (0.5 - 0.1) + 0.1;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
      osc.stop(now + duration);
    } catch(e) {}
  }

  function addMessage(user, text) {
    if (user !== 'me') playBeep();
    const div = document.createElement("div");
    div.className = user === "me" ? "message me" : user === "system" ? "message system" : "message other";
    const prefix = user === "me" ? "[me] " : user === "system" ? "[system] " : `[${user}] `;
    let formattedText = text;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    if (text.match(urlRegex)) {
      formattedText = text.replace(urlRegex, (url) => {
        let fullUrl = url.startsWith('http') ? url : 'https://' + url;
        return `<a href="${fullUrl}" target="_blank" style="color:#0f0;">${url}</a>`;
      });
    }
    div.innerHTML = prefix + formattedText;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessageWithoutSound(user, text) {
    const div = document.createElement("div");
    div.className = user === "me" ? "message me" : user === "system" ? "message system" : "message other";
    const prefix = user === "me" ? "[me] " : user === "system" ? "[system] " : `[${user}] `;
    div.innerHTML = prefix + text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  const themeBtns = document.querySelectorAll('.theme-btn');
  const savedTheme = localStorage.getItem('cancord-theme') || 'terminal';
  document.body.className = `theme-${savedTheme}`;
  themeBtns.forEach(btn => {
    if (btn.dataset.theme === savedTheme) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.className = `theme-${theme}`;
      localStorage.setItem('cancord-theme', theme);
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  socket.on("room:peers", (users) => {
    const countEl = document.getElementById('userCount');
    if (countEl) countEl.textContent = users.length;
  });

  const spotifyBtn = document.createElement('button');
  spotifyBtn.textContent = '🎵 Spotify Jam';
  spotifyBtn.style.cssText = 'background:#1DB954;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;margin-left:10px;';
  spotifyBtn.onclick = () => {
    window.open('https://open.spotify.com/jam', '_blank');
    addMessageWithoutSound('system', '🎧 Spotify Jam açıldı!');
  };
  const micBtnParent = document.getElementById('micBtn');
  if (micBtnParent) micBtnParent.parentNode.appendChild(spotifyBtn);
}

window.register = register;
window.login = login;
window.logout = logout;