// main.js - DÜZELTİLMİŞ VERSİYON
console.log("CLIENT ONLINE - Screen Share FINAL FIXED VERSION");

const socket = io();

const username = prompt("Nick gir (dark web takıl):") || "anonymous";

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

/* ======================
   WEBRTC STATE
====================== */
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

/* ======================
   SOCKET CONNECT
====================== */
socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
  socket.emit("room:join", {
    roomId: ROOM_ID,
    username
  });
});

/* ======================
   ROOM PEERS MANAGEMENT
====================== */
socket.on("room:peers", (users) => {
  console.log("👥 Room peers:", users);
  usersEl.innerHTML = "";
  users.forEach(name => {
    const div = document.createElement("div");
    div.textContent = "🟢 " + name;
    div.id = `user-${name}`;
    usersEl.appendChild(div);
  });

  // Birden fazla kullanıcı varsa bağlantı başlat
  if (users.length > 1) {
    console.log("📞 Starting call with peers...");
    startCall();
  }
});

socket.on("peer:joined", ({ username, socketId }) => {
  console.log("➕ Peer joined:", username, socketId);
  const div = document.createElement("div");
  div.textContent = "🟢 " + username;
  div.id = `user-${username}`;
  usersEl.appendChild(div);
});

socket.on("peer:left", ({ username }) => {
  console.log("➖ Peer left:", username);
  const userEl = document.getElementById(`user-${username}`);
  if (userEl) userEl.remove();
});

/* ======================
   CHAT
====================== */
sendBtn.onclick = () => {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("chat:message", {
    roomId: ROOM_ID,
    message: msg
  });

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

/* ======================
   SIGNALING
====================== */
socket.on("signal", async ({ data, from }) => {
  console.log("📨 Signal received from:", from, "Type:", data.type);
  
  if (!peerConnection) {
    console.log("🔄 Creating new peer connection...");
    await initPeer();
  }

  try {
    if (data.type === "offer") {
      console.log("📥 Processing offer...");
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("signal", {
        roomId: ROOM_ID,
        to: from,
        data: { type: "answer", answer }
      });
      console.log("📤 Answer sent");
    }

    if (data.type === "answer") {
      console.log("📥 Processing answer...");
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.type === "ice") {
      console.log("🧊 Processing ICE candidate...");
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn("ICE candidate error:", e.message);
      }
    }
  } catch (error) {
    console.error("❌ Signal processing error:", error);
  }
});

/* ======================
   WEBRTC CORE - DÜZELTİLDİ!
====================== */
async function initPeer() {
  console.log("🛠️ Initializing peer connection...");
  
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Sadece mikrofon
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    console.log("🎤 Microphone added");
  } catch (error) {
    console.error("❌ Microphone error:", error);
  }

  // ✨ TEK VE DOĞRU ontrack EVENT'I ✨
  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    const track = event.track;
    
    console.log("📹 TRACK EVENT FIRED!", {
      kind: track.kind,
      label: track.label,
      id: track.id.substring(0, 8),
      streams: event.streams.length
    });

    if (track.kind === "video") {
      // TÜM video track'leri EKRAN olarak kabul et!
      console.log("🎯 SHOWING VIDEO AS SCREEN!");
      
      // Track bilgilerini göster
      console.log("🔍 Video track details:", {
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState
      });
      
      // Hemen göster (gecikme olmasın)
      displayRemoteScreen(stream, "Remote User");
      
      // Debug için track events
      track.onmute = () => console.log("📹 Track muted");
      track.onunmute = () => console.log("📹 Track unmuted");
      track.onended = () => console.log("📹 Track ended");
    }
    
    if (track.kind === "audio") {
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.volume = 0.7;
      audio.style.display = "none";
      document.body.appendChild(audio);
      console.log("🔊 Audio playback started");
    }
  };

  // ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        roomId: ROOM_ID,
        data: { type: "ice", candidate: event.candidate }
      });
    }
  };

  // Connection state
  peerConnection.onconnectionstatechange = () => {
    console.log("🔗 Connection state:", peerConnection.connectionState);
    screenBtn.disabled = peerConnection.connectionState !== "connected";
    
    if (peerConnection.connectionState === "connected") {
      console.log("🎉 PEER CONNECTION CONNECTED!");
    }
  };

  peerConnection.onsignalingstatechange = () => {
    console.log("📡 Signaling state:", peerConnection.signalingState);
  };
}

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
    
    console.log("📤 Initial offer sent");
  } catch (error) {
    console.error("❌ Start call error:", error);
  }
}

/* ======================
   SCREEN SHARE - GÜNCELLENDİ!
====================== */
screenBtn.onclick = async () => {
  if (isSharingScreen) {
    await stopScreenSharing();
  } else {
    await startScreenSharing();
  }
};

async function startScreenSharing() {
  try {
    console.log("🚀 Starting screen sharing...");
    
    // 1. Ekranı al
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor"
      },
      audio: false
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    console.log("✅ Screen track obtained:", {
      id: screenTrack.id,
      label: screenTrack.label,
      readyState: screenTrack.readyState
    });

    // 2. LOCAL PREVIEW
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenContainer.classList.add("active");
    screenVideo.classList.add("active");
    
    // 3. Peer connection'a ekle
    const senders = peerConnection.getSenders();
    console.log(`📊 Found ${senders.length} senders`);
    
    let videoSender = senders.find(s => s.track && s.track.kind === "video");
    
    if (videoSender) {
      console.log("🔄 Replacing existing video track");
      await videoSender.replaceTrack(screenTrack);
      screenSender = videoSender;
    } else {
      console.log("➕ Adding new video track");
      screenSender = peerConnection.addTrack(screenTrack, screenStream);
    }

    // 4. UI Update
    screenBtn.classList.add("active");
    screenBtn.textContent = "🔴 Stop Screen";
    isSharingScreen = true;

    // 5. Track sonlandığında
    screenTrack.onended = () => {
      console.log("⏹️ Screen track ended by user");
      stopScreenSharing();
    };

    // 6. ⚡ RENEGOTIATION YAP
    console.log("📡 Triggering renegotiation for screen share...");
    
    // Kısa bekle
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log("📊 Current state:", {
      signaling: peerConnection.signalingState,
      connection: peerConnection.connectionState
    });
    
    if (peerConnection.signalingState === "stable") {
      await sendRenegotiationOffer();
    } else {
      console.log("⏳ Waiting for stable state...");
      setTimeout(() => {
        if (peerConnection.signalingState === "stable") {
          sendRenegotiationOffer();
        }
      }, 500);
    }

  } catch (error) {
    console.error("❌ Screen share error:", error);
    screenBtn.classList.remove("active");
    screenBtn.textContent = "🖥️ Share Screen";
    isSharingScreen = false;
    
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
  }
}

async function stopScreenSharing() {
  console.log("🛑 Stopping screen sharing...");
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // Local preview'u temizle
  screenVideo.srcObject = null;
  screenVideo.classList.remove("active");
  screenContainer.classList.remove("active");

  // Screen track'ini kaldır
  if (screenSender) {
    try {
      await screenSender.replaceTrack(null);
      console.log("✅ Screen track removed from sender");
    } catch (e) {
      console.warn("⚠️ Could not replace track:", e.message);
    }
  }

  // UI Update
  screenBtn.classList.remove("active");
  screenBtn.textContent = "🖥️ Share Screen";
  isSharingScreen = false;
  screenSender = null;

  // Yeni offer gönder
  setTimeout(() => {
    if (peerConnection && peerConnection.signalingState === "stable") {
      sendRenegotiationOffer();
    }
  }, 300);
  
  console.log("✅ Screen sharing stopped");
}

async function sendRenegotiationOffer() {
  if (!peerConnection || peerConnection.signalingState !== "stable") {
    console.log("⏳ Cannot renegotiate, state not stable");
    return;
  }

  try {
    console.log("🔄 Creating renegotiation offer...");
    
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    console.log("📄 Offer created:", offer.type);
    
    await peerConnection.setLocalDescription(offer);
    console.log("✅ Local description set");
    
    socket.emit("signal", {
      roomId: ROOM_ID,
      data: { type: "offer", offer: peerConnection.localDescription }
    });
    
    console.log("🎉 RENEGOTIATION OFFER SENT TO SERVER!");
    
  } catch (error) {
    console.error("❌ Renegotiation error:", error);
  }
}

/* ======================
   REMOTE SCREEN DISPLAY - GÜNCELLENDİ!
====================== */
function displayRemoteScreen(stream, username) {
  console.log("🎬 Displaying remote screen for:", username);
  
  // Container ID'si (username'den)
  const containerId = `remote-screen-${username.replace(/\s+/g, '-')}`;
  
  // Eski ekranı kontrol et
  let container = document.getElementById(containerId);
  let video;
  
  if (container) {
    console.log("🔄 Updating existing remote screen");
    video = container.querySelector('video');
    if (video) {
      video.srcObject = stream;
      return container;
    }
  }

  // YENİ CONTAINER OLUŞTUR
  console.log("➕ Creating new remote screen container");
  container = document.createElement("div");
  container.id = containerId;
  container.className = "remote-screen-container";
  
  // CSS - MERKEZDE BÜYÜK EKRAN
  container.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 85vw;
    height: 85vh;
    background: rgba(0, 0, 0, 0.95);
    border: 3px solid #22c55e;
    border-radius: 12px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 40px rgba(34, 197, 94, 0.4);
  `;

  // TITLE BAR
  const titleBar = document.createElement("div");
  titleBar.style.cssText = `
    background: #111;
    color: #22c55e;
    padding: 12px 20px;
    border-bottom: 2px solid #22c55e;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: monospace;
    font-size: 15px;
    font-weight: bold;
  `;
  
  const titleText = document.createElement("span");
  titleText.textContent = `📺 ${username} - CANLI YAYIN`;
  
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Kapat";
  closeBtn.style.cssText = `
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    width: 36px;
    height: 36px;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  closeBtn.onmouseover = () => {
    closeBtn.style.background = '#b91c1c';
    closeBtn.style.transform = 'scale(1.1)';
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.background = '#dc2626';
    closeBtn.style.transform = 'scale(1)';
  };
  closeBtn.onclick = () => container.remove();

  // VIDEO CONTAINER
  const videoContainer = document.createElement("div");
  videoContainer.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #000;
    position: relative;
  `;

  video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = `
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  `;
  video.srcObject = stream;

  // STATUS INDICATOR
  const statusIndicator = document.createElement("div");
  statusIndicator.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(34, 197, 94, 0.9);
    color: black;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    z-index: 2;
  `;
  statusIndicator.textContent = "CANLI";

  // BİRLEŞTİR
  titleBar.appendChild(titleText);
  titleBar.appendChild(closeBtn);
  
  videoContainer.appendChild(video);
  videoContainer.appendChild(statusIndicator);
  
  container.appendChild(titleBar);
  container.appendChild(videoContainer);
  
  document.body.appendChild(container);

  console.log("✅ REMOTE SCREEN CREATED AND DISPLAYED!");

  // VIDEO EVENTS
  video.onplaying = () => {
    console.log("🎬 REMOTE VIDEO IS PLAYING!");
    statusIndicator.textContent = "🔴 CANLI";
    statusIndicator.style.background = 'rgba(220, 38, 38, 0.9)';
  };
  
  video.onpause = () => {
    statusIndicator.textContent = "⏸️ DURAKLATILDI";
    statusIndicator.style.background = 'rgba(234, 179, 8, 0.9)';
  };
  
  video.onerror = (e) => {
    console.error("❌ Video error:", e);
    statusIndicator.textContent = "❌ HATA";
    statusIndicator.style.background = 'rgba(75, 85, 99, 0.9)';
  };

  // STREAM ENDED
  stream.onremovetrack = () => {
    console.log("🧹 Remote screen stream ended");
    setTimeout(() => {
      if (container && container.parentNode) {
        statusIndicator.textContent = "⏹️ YAYIN SONLANDI";
        statusIndicator.style.background = 'rgba(75, 85, 99, 0.9)';
        setTimeout(() => container.remove(), 2000);
      }
    }, 1000);
  };

  return container;
}

/* ======================
   MICROPHONE TOGGLE
====================== */
micBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  
  track.enabled = !track.enabled;
  micBtn.classList.toggle("active", track.enabled);
  micBtn.textContent = track.enabled ? "🎤 On" : "🎤 Off";
  console.log("🎤 Microphone:", track.enabled ? "ON" : "OFF");
};

/* ======================
   UI HELPERS
====================== */
function addMessage(user, text) {
  const div = document.createElement("div");
  div.className = user === "me" ? "message me" : 
                  user === "system" ? "message system" : "message other";
  div.textContent = user === "me" ? `[me] ${text}` : 
                   user === "system" ? `[system] ${text}` : `[${user}] ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

console.log("🎮 App initialized. Username:", username);