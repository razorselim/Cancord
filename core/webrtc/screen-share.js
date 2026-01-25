async function startScreenShare() {
  try {
    console.log("🚀 === EKRAN PAYLAŞIMI BAŞLATILIYOR ===");
    
    // Peer connection kontrolü
    if (!peerConnection) {
      console.warn("⚠️ Peer connection yok, oluşturuluyor...");
      await initPeer();
    }
    
    // Eğer zaten ekran paylaşımı varsa, önce durdur
    if (screenStream) {
      console.log("🔄 Mevcut ekran paylaşımı durduruluyor...");
      await stopScreenShare();
      await new Promise(resolve => setTimeout(resolve, 300)); // Kısa bekle
    }
    
    // Ekran paylaşımı izni iste
    console.log("🎬 getDisplayMedia çağrılıyor...");
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor",
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false // Sistem sesi istemiyoruz
    }).catch(err => {
      console.error("❌ getDisplayMedia hatası:", err);
      throw err;
    });

    if (!screenStream) {
      throw new Error("Ekran stream'i alınamadı");
    }
    
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      throw new Error("Ekran track'i bulunamadı");
    }
    
    console.log("✅ Ekran stream alındı:", {
      trackId: screenTrack.id,
      label: screenTrack.label,
      enabled: screenTrack.enabled,
      readyState: screenTrack.readyState
    });
    
    // 🔴 LOCAL PREVIEW - KENDİ EKRANINI GÖSTER
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.play().catch(e => console.warn("Video play hatası:", e));
    screenContainer.classList.add("active");
    screenVideo.classList.add("active");
    console.log("👁️ Local preview aktif");
    
    // Track'i işaretle (diğer tarafta tanımak için)
    screenTrack.label = `screen-share-${socket.id}-${Date.now()}`;
    console.log("🏷️ Track label güncellendi:", screenTrack.label);
    
    // 📡 WEBRTC: Track'i peer connection'a ekle
    console.log("🔗 Track peer connection'a ekleniyor...");
    
    const senders = peerConnection.getSenders();
    console.log(`📊 Mevcut ${senders.length} sender var`);
    
    // 1. ÖNCE: Mevcut bir video sender var mı kontrol et
    let existingVideoSender = null;
    
    // Önce video sender ara
    for (const sender of senders) {
      if (sender.track && sender.track.kind === "video") {
        existingVideoSender = sender;
        console.log("🎥 Mevcut video sender bulundu:", {
          trackLabel: sender.track.label,
          trackId: sender.track.id
        });
        break;
      }
    }
    
    // 2. STRATEJİ: Track'i ekle veya değiştir
    if (existingVideoSender) {
      // Mevcut video sender varsa track'i değiştir
      console.log("🔄 Mevcut video track'i ekran track'i ile değiştiriliyor...");
      try {
        await existingVideoSender.replaceTrack(screenTrack);
        screenSender = existingVideoSender;
        console.log("✅ Track başarıyla değiştirildi");
      } catch (replaceError) {
        console.error("❌ Track değiştirme hatası:", replaceError);
        // Fallback: yeni sender ekle
        console.log("🔄 Fallback: Yeni sender ekleniyor...");
        screenSender = peerConnection.addTrack(screenTrack, screenStream);
      }
    } else {
      // Video sender yoksa, yeni ekle
      console.log("➕ Yeni video sender ekleniyor...");
      screenSender = peerConnection.addTrack(screenTrack, screenStream);
    }
    
    // 3. DEBUG: Sender durumunu kontrol et
    if (screenSender && screenSender.track) {
      console.log("✅ Sender başarıyla eklendi/değiştirildi:", {
        senderId: screenSender.id || "unknown",
        trackLabel: screenSender.track.label,
        trackReadyState: screenSender.track.readyState
      });
    } else {
      console.error("❌ Sender/track sorunu!");
    }
    
    // 4. UI GÜNCELLE
    screenBtn.classList.add("active");
    screenBtn.textContent = "🔴 Durdur";
    screenBtn.disabled = false;
    console.log("🎯 UI güncellendi");
    
    // 5. TRACK SONLANMA EVENT'I
    screenTrack.onended = () => {
      console.log("⏹️ Kullanıcı ekran paylaşımını durdurdu");
      stopScreenShare();
    };
    
    // Ekstra güvenlik: stream'in diğer track'leri
    screenStream.getTracks().forEach((track, index) => {
      console.log(`Track ${index}:`, track.kind, track.label);
      track.onended = () => {
        console.log(`Track ${index} sonlandı`);
        if (track === screenTrack) {
          stopScreenShare();
        }
      };
    });
    
    // ⚡ KRİTİK: SIGNALING - Diğer kullanıcılara haber ver
    console.log("📡 SIGNALING: Diğer kullanıcılara haber veriliyor...");
    
    // Küçük bir gecikme ekle (track'in stabilize olması için)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Peer connection durumunu kontrol et
    console.log("📊 Peer connection durumu:", {
      signalingState: peerConnection.signalingState,
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState
    });
    
    // Transceiver'ları debug et
    const transceivers = peerConnection.getTransceivers();
    console.log(`📊 ${transceivers.length} transceiver var:`);
    transceivers.forEach((tc, i) => {
      console.log(`  Transceiver ${i}:`, {
        kind: tc.receiver.track?.kind || 'none',
        direction: tc.direction,
        currentDirection: tc.currentDirection || 'none',
        senderTrack: tc.sender.track?.label || 'none',
        receiverTrack: tc.receiver.track?.label || 'none'
      });
    });
    
    // RENEGOTIATION BAŞLAT
    if (peerConnection.signalingState === "stable") {
      console.log("🔄 Renegotiation başlatılıyor...");
      
      // Önce offer oluşturma seçenekleri
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      };
      
      try {
        const offer = await peerConnection.createOffer(offerOptions);
        console.log("📄 Offer oluşturuldu:", offer.type);
        
        await peerConnection.setLocalDescription(offer);
        console.log("✅ Local description ayarlandı");
        
        // Offer'ı server'a gönder
        socket.emit("signal", {
          roomId: ROOM_ID,
          data: {
            type: "offer",
            offer: peerConnection.localDescription
          }
        });
        
        console.log("📤 Offer server'a gönderildi");
        
        // Debug için transceiver'ları tekrar kontrol et
        setTimeout(() => {
          console.log("🕵️ Renegotiation sonrası transceiver'lar:");
          peerConnection.getTransceivers().forEach((tc, i) => {
            if (tc.sender.track) {
              console.log(`  Sender ${i}:`, tc.sender.track.label);
            }
          });
        }, 1000);
        
      } catch (renegError) {
        console.error("❌ Renegotiation hatası:", renegError);
        
        // Fallback: basit renegotiation dene
        try {
          const simpleOffer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(simpleOffer);
          
          socket.emit("signal", {
            roomId: ROOM_ID,
            data: { type: "offer", offer: peerConnection.localDescription }
          });
          
          console.log("🔄 Fallback renegotiation başarılı");
        } catch (fallbackError) {
          console.error("❌ Fallback de başarısız:", fallbackError);
        }
      }
    } else {
      console.warn("⚠️ Signaling state stable değil:", peerConnection.signalingState);
      console.log("⏳ Signaling state'in stable olması bekleniyor...");
      
      // State değişikliğini dinle
      const checkState = () => {
        if (peerConnection.signalingState === "stable") {
          console.log("✅ Artık stable, renegotiation başlatılıyor...");
          // Kısa bir bekleme sonrası tekrar dene
          setTimeout(() => {
            startScreenShareRenegotiation();
          }, 1000);
        } else {
          setTimeout(checkState, 500);
        }
      };
      checkState();
    }
    
    console.log("🎉 === EKRAN PAYLAŞIMI BAŞLATILDI ===");
    
  } catch (error) {
    console.error("❌ === EKRAN PAYLAŞIMI HATASI ===", error);
    console.error("Hata detayı:", error.name, error.message);
    
    // UI'ı resetle
    screenBtn.classList.remove("active");
    screenBtn.textContent = "🖥️ Ekran Paylaş";
    screenBtn.disabled = false;
    
    // Stream'i temizle
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    
    // Local preview'u temizle
    screenVideo.srcObject = null;
    screenContainer.classList.remove("active");
    screenVideo.classList.remove("active");
    
    // Kullanıcıya hata göster
    if (error.name === "NotAllowedError") {
      alert("⚠️ Ekran paylaşımı izni reddedildi. Lütfen izin verin.");
    } else if (error.name === "NotFoundError") {
      alert("⚠️ Ekran bulunamadı. Paylaşılabilir bir ekran olduğundan emin olun.");
    } else {
      alert(`⚠️ Ekran paylaşımı hatası: ${error.message}`);
    }
  }
}

// Yardımcı fonksiyon: Sadece renegotiation için
async function startScreenShareRenegotiation() {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.emit("signal", {
      roomId: ROOM_ID,
      data: { type: "offer", offer: peerConnection.localDescription }
    });
    
    console.log("📤 Renegotiation offer gönderildi");
  } catch (error) {
    console.error("Renegotiation hatası:", error);
  }
}