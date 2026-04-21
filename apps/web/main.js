// main.js - SADECE NO SIGNAL DÜZELTİLDİ
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

// ========== SCREEN SHARE ==========
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
    
    if (!peerConnection) {
      await initPeer();
      await startCall();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
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
  
  // Show NO SIGNAL again - TAM ORTADA
  const noSignalDiv = document.querySelector('.no-signal');
  if (noSignalDiv) {
    noSignalDiv.style.display = 'flex';
    noSignalDiv.style.position = 'absolute';
    noSignalDiv.style.top = '50%';
    noSignalDiv.style.left = '50%';
    noSignalDiv.style.transform = 'translate(-50%, -50%)';
    noSignalDiv.style.width = '100%';
    noSignalDiv.style.textAlign = 'center';
  }
  
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

// ========== REMOTE SCREEN (İZLEYİCİ) ==========
function displayRemoteScreen(stream, username) {
  console.log("🎬 Displaying remote screen for viewer:", username);
  
  // ANA EKRANDA GÖSTER
  screenVideo.srcObject = stream;
  screenVideo.muted = false;
  screenContainer.classList.add("active");
  screenVideo.classList.add("active");
  
  // NO SIGNAL gizle
  const noSignalDiv = document.querySelector('.no-signal');
  if (noSignalDiv) noSignalDiv.style.display = 'none';
  
  // Stream bittiğinde geri al
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.onended = () => {
      console.log("📴 Remote screen ended");
      screenVideo.srcObject = null;
      screenVideo.classList.remove("active");
      screenContainer.classList.remove("active");
      if (noSignalDiv) {
        noSignalDiv.style.display = 'flex';
        noSignalDiv.style.position = 'absolute';
        noSignalDiv.style.top = '50%';
        noSignalDiv.style.left = '50%';
        noSignalDiv.style.transform = 'translate(-50%, -50%)';
      }
    };
  }
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

// ========== SPOTIFY JAM BUTONU ==========
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
    addMessage('system', '🎧 Spotify Jam açıldı!');
};

const micBtnElement = document.getElementById('micBtn');
if (micBtnElement) {
    micBtnElement.parentNode.appendChild(spotifyBtn);
} else {
    document.querySelector('.controls').appendChild(spotifyBtn);
}

console.log("🎮 App ready. Username:", username);