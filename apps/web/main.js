// main.js - TAM VE ÇALIŞAN VERSİYON
console.log("CLIENT ONLINE - Screen Share WORKING VERSION");

const socket = io();

const username = prompt("Nick gir:") || "anonymous";

// UI Elements
const usersEl = document.getElementById("users");
const messagesEl = document.getElementById("messages");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const screenBtn = document.getElementById("screenBtn");

const screenContainer = document.getElementById("screenContainer");
const screenVideo = document.getElementById("screenVideo");

const ROOM_ID = "room-1";

// WebRTC State
let localStream = null;
let peerConnection = null;
let screenStream = null;
let isSharingScreen = false;
let screenSender = null;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// Socket Connect
socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
  socket.emit("room:join", { roomId: ROOM_ID, username });
});

// Room Peers
socket.on("room:peers", (users) => {
  console.log("👥 Room peers:", users);
  usersEl.innerHTML = "";
  users.forEach(name => {
    const div = document.createElement("div");
    div.textContent = "🟢 " + name;
    div.id = `user-${name}`;
    usersEl.appendChild(div);
  });
  if (users.length > 1) {
    console.log("📞 Starting call...");
    startCall();
  }
});

socket.on("peer:joined", ({ username }) => {
  const div = document.createElement("div");
  div.textContent = "🟢 " + username;
  div.id = `user-${username}`;
  usersEl.appendChild(div);
});

socket.on("peer:left", ({ username }) => {
  const userEl = document.getElementById(`user-${username}`);
  if (userEl) userEl.remove();
});

// Chat
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

socket.on("chat:message", ({ from, message }) => {
  addMessage(from, message);
});

socket.on("system:message", ({ text }) => {
  addMessage("system", text);
});

// Signaling
socket.on("signal", async ({ data, from }) => {
  console.log("📨 Signal from:", from, "Type:", data.type);
  
  if (!peerConnection) {
    await initPeer();
  }

  try {
    if (data.type === "offer") {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", {
        roomId: ROOM_ID,
        to: from,
        data: { type: "answer", answer }
      });
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

// Init Peer Connection
async function initPeer() {
  console.log("🛠️ Init peer connection...");
  
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Microphone
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    console.log("🎤 Microphone OK");
  } catch (error) {
    console.error("Mic error:", error);
  }

  // Receive remote tracks
  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    const track = event.track;
    console.log("📹 TRACK:", track.kind);
    
    if (track.kind === "video") {
      displayRemoteScreen(stream, "Remote User");
      function displayRemoteScreen(stream, username) {
  console.log("🎬 Showing remote screen in main video:", username);

  // ANA VIDEOYA BAS
  screenVideo.srcObject = stream;
  screenVideo.muted = false; // karşı tarafın sesi varsa duy

  // UI aktif et
  screenContainer.classList.add("active");
  screenVideo.classList.add("active");

  // NO SIGNAL gizle
  const noSignalDiv = document.querySelector('.no-signal');
  if (noSignalDiv) noSignalDiv.style.display = 'none';

  // stream bittiğinde geri al
  stream.getVideoTracks()[0].onended = () => {
    console.log("📴 Remote screen ended");

    screenVideo.srcObject = null;
    screenVideo.classList.remove("active");
    screenContainer.classList.remove("active");

    if (noSignalDiv) noSignalDiv.style.display = 'flex';
  };
}
    }
    if (track.kind === "audio") {
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.volume = 0.7;
      audio.style.display = "none";
      document.body.appendChild(audio);
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        roomId: ROOM_ID,
        data: { type: "ice", candidate: event.candidate }
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("🔗 Connection state:", peerConnection.connectionState);
  };
}

// Start Call
async function startCall() {
  console.log("📞 Starting call...");
  if (!peerConnection) await initPeer();

  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", {
      roomId: ROOM_ID,
      data: { type: "offer", offer }
    });
    console.log("📤 Offer sent");
  } catch (error) {
    console.error("Start call error:", error);
  }
}

// ========== SCREEN SHARE - FIXED ==========
screenBtn.onclick = async () => {
  if (isSharingScreen) {
    await stopScreenSharing();
  } else {
    await startScreenSharing();
  }
};

async function startScreenSharing() {
  try {
    console.log("🚀 Starting screen share...");
    
    // Maksimum kalite
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 60, max: 60 }
      },
      audio: false
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    console.log("✅ Screen track:", screenTrack.label);
    
    // Local preview
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenContainer.classList.add("active");
    screenVideo.classList.add("active");
    
    // Hide NO SIGNAL
    const noSignalDiv = document.querySelector('.no-signal');
    if (noSignalDiv) noSignalDiv.style.display = 'none';
    
    // Make sure peer connection exists
    if (!peerConnection) {
      await initPeer();
      await startCall();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Add or replace track
    const senders = peerConnection.getSenders();
    let videoSender = senders.find(s => s.track && s.track.kind === "video");
    
    if (videoSender) {
      await videoSender.replaceTrack(screenTrack);
      screenSender = videoSender;
    } else {
      screenSender = peerConnection.addTrack(screenTrack, screenStream);
    }
    
    screenBtn.classList.add("active");
    screenBtn.innerHTML = '<span>🔴</span><span>STOP</span>';
    isSharingScreen = true;
    
    screenTrack.onended = () => {
      console.log("⏹️ Screen share ended");
      stopScreenSharing();
    };
    
    // Renegotiate
    if (peerConnection.signalingState === "stable") {
      await sendRenegotiationOffer();
    }
    
  } catch (error) {
    console.error("Screen share error:", error);
    screenBtn.classList.remove("active");
    screenBtn.innerHTML = '<span>🖥️</span><span>SHARE</span>';
    isSharingScreen = false;
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
  }
}

async function stopScreenSharing() {
  console.log("🛑 Stopping screen share...");
  
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  screenVideo.srcObject = null;
  screenVideo.classList.remove("active");
  screenContainer.classList.remove("active");
  
  // Show NO SIGNAL again
  const noSignalDiv = document.querySelector('.no-signal');
  if (noSignalDiv) noSignalDiv.style.display = 'flex';
  
  if (screenSender) {
    try {
      await screenSender.replaceTrack(null);
    } catch (e) {
      console.warn(e);
    }
  }
  
  screenBtn.classList.remove("active");
  screenBtn.innerHTML = '<span>🖥️</span><span>SHARE</span>';
  isSharingScreen = false;
  screenSender = null;
  
  if (peerConnection && peerConnection.signalingState === "stable") {
    await sendRenegotiationOffer();
  }
}

async function sendRenegotiationOffer() {
  if (!peerConnection || peerConnection.signalingState !== "stable") return;
  
  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", {
      roomId: ROOM_ID,
      data: { type: "offer", offer: peerConnection.localDescription }
    });
  } catch (error) {
    console.error("Renegotiation error:", error);
  }
}

// ========== REMOTE SCREEN - VIEWER SIDE WITH FULLSCREEN BUTTON ==========
function displayRemoteScreen(stream, username) {
  console.log("🎬 Displaying remote screen for viewer:", username);
  
  const containerId = `remote-screen-${username.replace(/\s+/g, '-')}`;
  let container = document.getElementById(containerId);
  let video;
  
  // Eğer varsa güncelle
  if (container) {
    video = container.querySelector('video');
    if (video) {
      video.srcObject = stream;
      container.style.display = 'flex';
      // NO SIGNAL yazısını gizle
      const noSignalOverlay = container.querySelector('.no-signal-overlay');
      if (noSignalOverlay) noSignalOverlay.style.display = 'none';
      return;
    }
  }
  
  // YENİ CONTAINER
  container = document.createElement("div");
  container.id = containerId;
  container.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: #000 !important;
    z-index: 9999 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
  `;
  
  // NO SIGNAL overlay (başlangıçta görünür)
  const noSignalOverlay = document.createElement("div");
  noSignalOverlay.className = "no-signal-overlay";
  noSignalOverlay.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    background: #000 !important;
    z-index: 10001 !important;
    font-family: monospace !important;
  `;
  
  const noSignalText = document.createElement("div");
  noSignalText.style.cssText = `
    font-size: 32px !important;
    letter-spacing: 8px !important;
    color: #333 !important;
    margin-bottom: 12px !important;
  `;
  noSignalText.textContent = "NO SIGNAL";
  
  const noSignalSub = document.createElement("div");
  noSignalSub.style.cssText = `
    font-size: 12px !important;
    color: #222 !important;
  `;
  noSignalSub.textContent = "waiting for stream...";
  
  noSignalOverlay.appendChild(noSignalText);
  noSignalOverlay.appendChild(noSignalSub);
  
  // Video elementi
  video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = `
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    background: #000 !important;
  `;
  video.srcObject = stream;
  
  // Video başlayınca NO SIGNAL'i gizle
  video.onplaying = () => {
    console.log("▶️ Video playing, hiding NO SIGNAL");
    if (noSignalOverlay) {
      noSignalOverlay.style.opacity = '0';
      setTimeout(() => {
        noSignalOverlay.style.display = 'none';
      }, 500);
    }
  };
  
  // TAM EKRAN BUTONU (sağ altta)
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.innerHTML = "⛶";
  fullscreenBtn.title = "Full Screen";
  fullscreenBtn.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    width: 48px !important;
    height: 48px !important;
    background: rgba(0,0,0,0.6) !important;
    backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255,255,255,0.2) !important;
    border-radius: 12px !important;
    color: #fff !important;
    font-size: 24px !important;
    cursor: pointer !important;
    z-index: 10002 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    font-family: monospace !important;
  `;
  
  fullscreenBtn.onmouseover = () => {
    fullscreenBtn.style.background = 'rgba(0,0,0,0.8)';
    fullscreenBtn.style.transform = 'scale(1.05)';
  };
  fullscreenBtn.onmouseout = () => {
    fullscreenBtn.style.background = 'rgba(0,0,0,0.6)';
    fullscreenBtn.style.transform = 'scale(1)';
  };
  fullscreenBtn.onclick = () => {
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen();
    } else if (video.msRequestFullscreen) {
      video.msRequestFullscreen();
    }
  };
  
  // Kapatma butonu (sağ üstte)
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Close";
  closeBtn.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 40px !important;
    height: 40px !important;
    background: rgba(255,51,51,0.8) !important;
    border: none !important;
    border-radius: 8px !important;
    color: #fff !important;
    font-size: 18px !important;
    cursor: pointer !important;
    z-index: 10002 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
  `;
  
  closeBtn.onmouseover = () => {
    closeBtn.style.background = 'rgba(255,51,51,1)';
    closeBtn.style.transform = 'scale(1.05)';
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.background = 'rgba(255,51,51,0.8)';
    closeBtn.style.transform = 'scale(1)';
  };
  closeBtn.onclick = () => {
    container.remove();
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
  };
  
  // Container'a ekle
  container.appendChild(video);
  container.appendChild(noSignalOverlay);
  container.appendChild(fullscreenBtn);
  container.appendChild(closeBtn);
  
  document.body.appendChild(container);
  
  // Stream bittiğinde
  stream.onremovetrack = () => {
    console.log("📹 Stream ended");
    if (noSignalOverlay) {
      noSignalOverlay.style.display = 'flex';
      noSignalOverlay.style.opacity = '1';
      noSignalText.textContent = "STREAM ENDED";
      noSignalSub.textContent = "screen share stopped";
    }
    setTimeout(() => {
      if (container && container.parentNode && !stream.active) {
        container.remove();
      }
    }, 3000);
  };
  
  console.log("✅ Remote screen display ready with fullscreen button");
  return container;
}

// Microphone Toggle
micBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  micBtn.classList.toggle("active", track.enabled);
  micBtn.innerHTML = track.enabled ? '<span>🎤</span><span>ON</span>' : '<span>🎤</span><span>OFF</span>';
};

// Add Message
function addMessage(user, text) {
  const div = document.createElement("div");
  div.className = user === "me" ? "message me" : user === "system" ? "message system" : "message other";
  
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  let formattedText = text;
  if (text.match(urlRegex)) {
    formattedText = text.replace(urlRegex, (url) => {
      let fullUrl = url.startsWith('http') ? url : 'https://' + url;
      return `<a href="${fullUrl}" target="_blank" style="color: #0f0; text-decoration: underline;">${url}</a>`;
    });
  }
  
  const prefix = user === "me" ? "[me] " : user === "system" ? "[system] " : `[${user}] `;
  div.innerHTML = prefix + formattedText;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Theme Selector
const themeBtns = document.querySelectorAll('.theme-btn');
const savedTheme = localStorage.getItem('cancord-theme') || 'terminal';
document.body.className = `theme-${savedTheme}`;
themeBtns.forEach(btn => {
  if (btn.dataset.theme === savedTheme) btn.classList.add('active');
});
themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    document.body.className = `theme-${theme}`;
    localStorage.setItem('cancord-theme', theme);
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function updateUserCount(count) {
  const countEl = document.getElementById('userCount');
  if (countEl) countEl.textContent = count;
}

socket.on("room:peers", (users) => {
  updateUserCount(users.length);
});

// ======================
// SPOTIFY JAM BUTONU
// ======================
const spotifyBtn = document.createElement('button');
spotifyBtn.textContent = '🎵 Spotify Jam';
spotifyBtn.id = 'spotifyJamBtn';
spotifyBtn.style.cssText = `
    background: #1DB954;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    margin-left: 10px;
    transition: all 0.2s;
`;

spotifyBtn.onmouseover = () => {
    spotifyBtn.style.background = '#1ed760';
    spotifyBtn.style.transform = 'scale(1.02)';
};
spotifyBtn.onmouseout = () => {
    spotifyBtn.style.background = '#1DB954';
    spotifyBtn.style.transform = 'scale(1)';
};

spotifyBtn.onclick = () => {
    window.open('https://open.spotify.com/jam', '_blank');
    addMessage('system', '🎧 Spotify Jam açıldı! Spotify\'dan "Create Jam" butonuna tıklayarak oda oluşturabilirsin.');
};

// Butonu ekle (mikrofon butonunun yanına)
const micBtnElement = document.getElementById('micBtn');
if (micBtnElement) {
    micBtnElement.parentNode.appendChild(spotifyBtn);
} else {
    document.querySelector('.controls').appendChild(spotifyBtn);
}

console.log("✅ Spotify Jam butonu eklendi");

console.log("🎮 App ready. Username:", username);