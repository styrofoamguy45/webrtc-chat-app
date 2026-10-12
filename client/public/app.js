// WebRTC Chat & Video Call Client
class WebRTCChat {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.username = null;
    this.roomId = null;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.localStream = null;
    this.remoteStream = null;
    this.callType = null; // 'audio' or 'video'
    this.incomingCallFrom = null;
    this.isInCall = false;
    
    // STUN servers for NAT traversal
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    this.initElements();
    this.bindEvents();
  }
  
  initElements() {
    // Screens
    this.loginScreen = document.getElementById('login-screen');
    this.chatScreen = document.getElementById('chat-screen');
    
    // Login form
    this.loginForm = document.getElementById('login-form');
    this.usernameInput = document.getElementById('username');
    this.roomIdInput = document.getElementById('room-id');
    
    // Chat header
    this.roomNameEl = document.getElementById('room-name');
    this.userCountEl = document.getElementById('user-count');
    this.myUserIdEl = document.getElementById('my-userid');
    this.leaveBtn = document.getElementById('leave-btn');
    
    // Users list
    this.usersList = document.getElementById('users-list');
    
    // Messages
    this.messagesContainer = document.getElementById('messages');
    this.chatForm = document.getElementById('chat-form');
    this.messageInput = document.getElementById('message-input');
    
    // Video sidebar
    this.videoSidebar = document.getElementById('video-sidebar');
    this.remoteVideo = document.getElementById('remote-video');
    this.localVideo = document.getElementById('local-video');
    this.closeVideoBtn = document.getElementById('close-video');
    this.toggleAudioBtn = document.getElementById('toggle-audio');
    this.toggleVideoBtn = document.getElementById('toggle-video');
    this.endCallBtn = document.getElementById('end-call');
    this.callStatusEl = document.getElementById('call-status');
    
    // Incoming call modal
    this.incomingCallModal = document.getElementById('incoming-call-modal');
    this.callerNameEl = document.getElementById('caller-name');
    this.callTypeEl = document.getElementById('call-type');
    this.acceptCallBtn = document.getElementById('accept-call');
    this.rejectCallBtn = document.getElementById('reject-call');
  }
  
  bindEvents() {
    // Login
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    
    // Leave room
    this.leaveBtn.addEventListener('click', () => this.leaveRoom());
    
    // Chat
    this.chatForm.addEventListener('submit', (e) => this.sendMessage(e));
    
    // Video sidebar
    this.closeVideoBtn.addEventListener('click', () => this.closeVideoSidebar());
    this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
    this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
    this.endCallBtn.addEventListener('click', () => this.endCall());
    
    // Incoming call
    this.acceptCallBtn.addEventListener('click', () => this.acceptCall());
    this.rejectCallBtn.addEventListener('click', () => this.rejectCall());
    
    // Copy user ID
    this.myUserIdEl.addEventListener('click', () => this.copyUserId());
  }
  
  async handleLogin(e) {
    e.preventDefault();
    
    this.username = this.usernameInput.value.trim();
    this.roomId = this.roomIdInput.value.trim() || 'general';
    
    if (!this.username) return;
    
    // Connect to signaling server
    await this.connectWebSocket();
  }
  
  getSignalingServerUrl() {
    // Check for configured signaling server URL (set via meta tag for GitHub Pages)
    const metaUrl = document.querySelector('meta[name="signaling-server"]')?.content;
    if (metaUrl) return metaUrl;

    // Check for global config (for runtime overrides)
    if (window.SIGNALING_SERVER_URL) return window.SIGNALING_SERVER_URL;

    // Fallback to same origin (works for local dev and co-located deployments)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getSignalingServerUrl();
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to signaling server');
        // Send join message
        this.ws.send(JSON.stringify({
          type: 'join',
          username: this.username,
          roomId: this.roomId
        }));
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleServerMessage(message);
      };
      
      this.ws.onclose = () => {
        console.log('Disconnected from server');
        this.showLoginScreen();
      };
      
      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      };
      
      // Resolve when joined
      const checkJoined = setInterval(() => {
        if (this.userId) {
          clearInterval(checkJoined);
          resolve();
        }
      }, 100);
    });
  }
  
  handleServerMessage(message) {
    switch (message.type) {
      case 'joined':
        this.onJoined(message);
        break;
      case 'user-joined':
        this.onUserJoined(message);
        break;
      case 'user-left':
        this.onUserLeft(message);
        break;
      case 'chat':
        this.onChatMessage(message);
        break;
      case 'users-list':
        this.updateUsersList(message.users);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.handleWebRTCSignal(message);
        break;
      case 'incoming-call':
        this.onIncomingCall(message);
        break;
      case 'call-accepted':
        this.onCallAccepted(message);
        break;
      case 'call-rejected':
        this.onCallRejected(message);
        break;
      case 'call-ended':
        this.onCallEnded(message);
        break;
    }
  }
  
  onJoined(message) {
    this.userId = message.userId;
    this.username = message.username;
    this.roomId = message.roomId;
    
    // Update UI
    this.roomNameEl.textContent = `Room: ${this.roomId}`;
    this.myUserIdEl.textContent = `Your ID: ${this.userId}`;
    this.myUserIdEl.title = `Click to copy: ${this.userId}`;
    
    // Update users list
    this.updateUsersList(message.users);
    
    // Show chat screen
    this.showChatScreen();
  }
  
  onUserJoined(message) {
    this.updateUsersList(message.users);
    this.addSystemMessage(`${message.username} joined the room`);
  }
  
  onUserLeft(message) {
    this.updateUsersList(message.users);
    this.addSystemMessage(`${message.username} left the room`);
    
    // Clean up peer connection if exists
    if (this.peerConnections.has(message.userId)) {
      this.peerConnections.get(message.userId).close();
      this.peerConnections.delete(message.userId);
    }
    
    // If the user who left was in a call with us, end the call
    if (this.isInCall && this.currentCallPartner === message.userId) {
      this.endCallLocally();
    }
  }
  
  onChatMessage(message) {
    const isOwn = message.userId === this.userId;
    this.addMessage(message.username, message.text, message.timestamp, isOwn, message.userId);
  }
  
  updateUsersList(users) {
    this.usersList.innerHTML = '';
    this.userCountEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;
    
    users.forEach(user => {
      const li = document.createElement('li');
      li.className = `user-item${user.id === this.userId ? ' current' : ''}`;
      li.dataset.userId = user.id;
      
      const initial = user.username.charAt(0).toUpperCase();
      
      li.innerHTML = `
        <div class="user-avatar">${initial}</div>
        <div class="user-info">
          <div class="user-name">${user.username}${user.id === this.userId ? ' (you)' : ''}</div>
          <div class="user-id-small">${user.id.slice(0, 8)}...</div>
        </div>
        ${user.id !== this.userId ? `
          <div class="user-actions">
            <button class="call-btn audio" data-userid="${user.id}" data-type="audio" title="Audio Call">📞</button>
            <button class="call-btn video" data-userid="${user.id}" data-type="video" title="Video Call">📹</button>
          </div>
        ` : ''}
      `;
      
      this.usersList.appendChild(li);
    });
    
    // Bind call buttons
    this.usersList.querySelectorAll('.call-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.userid;
        const type = btn.dataset.type;
        this.initiateCall(targetId, type);
      });
    });
  }
  
  addMessage(username, text, timestamp, isOwn, userId) {
    const div = document.createElement('div');
    div.className = `message${isOwn ? ' own' : ''}`;
    
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const initial = username.charAt(0).toUpperCase();
    
    div.innerHTML = `
      <div class="message-avatar">${initial}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-username">${username}${isOwn ? ' (you)' : ''}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${this.escapeHtml(text)}</div>
      </div>
    `;
    
    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.style.cssText = 'align-self: center; color: var(--text-muted); font-size: 0.875rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 8px; max-width: 80%;';
    div.textContent = text;
    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  sendMessage(e) {
    e.preventDefault();
    const text = this.messageInput.value.trim();
    if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'chat',
      text: text
    }));
    
    this.messageInput.value = '';
  }
  
  // WebRTC Signaling
  async initiateCall(targetId, callType) {
    this.callType = callType;
    this.currentCallPartner = targetId;
    
    try {
      // Get user media
      const constraints = callType === 'video' 
        ? { video: true, audio: true }
        : { video: false, audio: true };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localVideo.srcObject = this.localStream;
      
      // Create peer connection
      const pc = this.createPeerConnection(targetId);
      this.peerConnections.set(targetId, pc);
      
      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
      
      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Send offer via signaling
      this.ws.send(JSON.stringify({
        type: 'offer',
        targetId: targetId,
        data: offer
      }));
      
      // Show video sidebar
      this.showVideoSidebar();
      this.setCallStatus(`Calling...`);
      
    } catch (err) {
      console.error('Error initiating call:', err);
      alert('Failed to start call: ' + err.message);
      this.cleanupCall();
    }
  }
  
  createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(this.iceServers);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          targetId: targetId,
          data: event.candidate
        }));
      }
    };
    
    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.remoteVideo.srcObject = this.remoteStream;
      this.setCallStatus('Connected');
    };
    
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.setCallStatus('Connected');
        this.isInCall = true;
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.setCallStatus('Connection lost');
        setTimeout(() => this.endCallLocally(), 3000);
      } else if (pc.connectionState === 'connecting') {
        this.setCallStatus('Connecting...');
      }
    };
    
    return pc;
  }
  
  async handleWebRTCSignal(message) {
    const { fromId, fromUsername, data, type } = message;
    
    let pc = this.peerConnections.get(fromId);
    
    if (type === 'offer') {
      // Incoming call - create peer connection if not exists
      if (!pc) {
        pc = this.createPeerConnection(fromId);
        this.peerConnections.set(fromId, pc);
        
        // Get user media for incoming call
        try {
          const constraints = data.type === 'video' ? { video: true, audio: true } : { video: false, audio: true };
          // We'll get media when user accepts
          this.pendingOffer = { fromId, fromUsername, offer: data, callType: data.video ? 'video' : 'audio' };
          return; // Wait for user to accept
        } catch (err) {
          console.error('Error getting media for incoming call:', err);
        }
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      this.ws.send(JSON.stringify({
        type: 'answer',
        targetId: fromId,
        data: answer
      }));
      
    } else if (type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      }
      
    } else if (type === 'ice-candidate') {
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    }
  }
  
  onIncomingCall(message) {
    this.incomingCallFrom = message.fromId;
    this.callType = message.callType;
    this.callerNameEl.textContent = message.fromUsername;
    this.callTypeEl.textContent = message.callType === 'video' ? 'Video Call' : 'Audio Call';
    this.incomingCallModal.classList.remove('hidden');
  }
  
  async acceptCall() {
    this.incomingCallModal.classList.add('hidden');
    
    try {
      const constraints = this.callType === 'video' 
        ? { video: true, audio: true }
        : { video: false, audio: true };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localVideo.srcObject = this.localStream;
      
      const pc = this.peerConnections.get(this.incomingCallFrom);
      if (pc && this.pendingOffer) {
        // Add local tracks
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream);
        });
        
        // Set remote description (the offer)
        await pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer.offer));
        
        // Create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Send answer
        this.ws.send(JSON.stringify({
          type: 'answer',
          targetId: this.incomingCallFrom,
          data: answer
        }));
        
        this.currentCallPartner = this.incomingCallFrom;
        this.showVideoSidebar();
        this.setCallStatus('Connected');
        this.isInCall = true;
        this.pendingOffer = null;
      }
    } catch (err) {
      console.error('Error accepting call:', err);
      alert('Failed to accept call: ' + err.message);
      this.cleanupCall();
    }
  }
  
  rejectCall() {
    if (this.incomingCallFrom) {
      this.ws.send(JSON.stringify({
        type: 'call-rejected',
        targetId: this.incomingCallFrom
      }));
    }
    this.incomingCallModal.classList.add('hidden');
    this.incomingCallFrom = null;
    this.pendingOffer = null;
  }
  
  onCallAccepted(message) {
    this.setCallStatus('Connected');
    this.isInCall = true;
  }
  
  onCallRejected(message) {
    this.addSystemMessage(`${message.fromUsername} rejected the call`);
    this.cleanupCall();
  }
  
  onCallEnded(message) {
    if (message.fromId === this.currentCallPartner) {
      this.addSystemMessage(`${message.fromUsername} ended the call`);
      this.cleanupCall();
    }
  }
  
  async toggleAudio() {
    if (!this.localStream) return;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.toggleAudioBtn.classList.toggle('active', !audioTrack.enabled);
      this.toggleAudioBtn.querySelector('.icon').textContent = audioTrack.enabled ? '🔊' : '🔇';
    }
  }
  
  async toggleVideo() {
    if (!this.localStream) return;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.toggleVideoBtn.classList.toggle('active', !videoTrack.enabled);
      this.toggleVideoBtn.querySelector('.icon').textContent = videoTrack.enabled ? '📹' : '📷';
    }
  }
  
  endCall() {
    if (this.currentCallPartner) {
      this.ws.send(JSON.stringify({
        type: 'call-ended',
        targetId: this.currentCallPartner
      }));
    }
    this.cleanupCall();
  }
  
  endCallLocally() {
    this.cleanupCall();
  }
  
  cleanupCall() {
    // Close peer connection
    if (this.currentCallPartner && this.peerConnections.has(this.currentCallPartner)) {
      this.peerConnections.get(this.currentCallPartner).close();
      this.peerConnections.delete(this.currentCallPartner);
    }
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Clear video elements
    this.remoteVideo.srcObject = null;
    this.localVideo.srcObject = null;
    
    // Reset state
    this.currentCallPartner = null;
    this.isInCall = false;
    this.callType = null;
    this.pendingOffer = null;
    
    // Hide video sidebar
    this.closeVideoSidebar();
  }
  
  showVideoSidebar() {
    this.videoSidebar.classList.add('active');
  }
  
  closeVideoSidebar() {
    this.videoSidebar.classList.remove('active');
  }
  
  setCallStatus(text) {
    this.callStatusEl.textContent = text;
    this.callStatusEl.classList.remove('hidden');
  }
  
  leaveRoom() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.cleanupCall();
    this.showLoginScreen();
  }
  
  showLoginScreen() {
    this.chatScreen.classList.remove('active');
    this.loginScreen.classList.add('active');
    this.usernameInput.value = '';
    this.roomIdInput.value = '';
    this.userId = null;
    this.username = null;
    this.roomId = null;
    this.usersList.innerHTML = '';
    this.messagesContainer.innerHTML = '';
  }
  
  showChatScreen() {
    this.loginScreen.classList.remove('active');
    this.chatScreen.classList.add('active');
    this.messageInput.focus();
  }
  
  copyUserId() {
    if (this.userId) {
      navigator.clipboard.writeText(this.userId).then(() => {
        const originalText = this.myUserIdEl.textContent;
        this.myUserIdEl.textContent = 'Copied!';
        setTimeout(() => {
          this.myUserIdEl.textContent = originalText;
        }, 1500);
      });
    }
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.chatApp = new WebRTCChat();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.chatApp) {
    window.chatApp.leaveRoom();
  }
});