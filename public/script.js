// Client-side JavaScript for Video Roulette
const socket = io();
let localStream;
let remoteStream;
let peerConnection;
let roomId;
let partnerId;

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusIndicator = document.getElementById('statusIndicator');
const startButton = document.getElementById('startButton');
const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const newPartnerButton = document.getElementById('newPartnerButton');

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize the app
function init() {
    // Set up event listeners
    startButton.addEventListener('click', startVideo);
    connectButton.addEventListener('click', findPartner);
    disconnectButton.addEventListener('click', disconnect);
    newPartnerButton.addEventListener('click', findNewPartner);
}

// Start local video stream
async function startVideo() {
    try {
        statusIndicator.textContent = 'Accessing camera and microphone...';
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        localVideo.srcObject = localStream;
        startButton.disabled = true;
        connectButton.disabled = false;
        statusIndicator.textContent = 'Camera ready. Click "Find Partner" to start.';
    } catch (error) {
        console.error('Error accessing media devices:', error);
        statusIndicator.textContent = 'Error accessing camera/microphone. Please allow permissions.';
    }
}

// Find a random partner
function findPartner() {
    statusIndicator.textContent = 'Looking for a partner...';
    connectButton.disabled = true;
    socket.emit('join');
}

// Handle connection to a partner
socket.on('connected', (data) => {
    roomId = data.roomId;
    partnerId = data.partnerId; // Store partner's socket ID
    statusIndicator.textContent = 'Connected! Enjoy your conversation.';
    disconnectButton.disabled = false;
    newPartnerButton.disabled = false;
    document.querySelector('.video-container').classList.add('connected');
    
    // Create peer connection
    createPeerConnection();
});

// Handle waiting for a partner
socket.on('waiting', () => {
    statusIndicator.textContent = 'Waiting for a partner...';
});

// Handle partner disconnect
socket.on('partner-disconnected', () => {
    statusIndicator.textContent = 'Partner disconnected. Looking for a new one...';
    disconnectButton.disabled = true;
    newPartnerButton.disabled = true;
    remoteVideo.srcObject = null;
    document.querySelector('.video-container').classList.remove('connected');
    
    // Reset connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
});

// Create WebRTC peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: partnerId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected') {
            statusIndicator.textContent = 'Connection lost. Looking for a new partner...';
        }
    };
    
    // Handle negotiation needed
    peerConnection.onnegotiationneeded = async () => {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', {
                target: partnerId,
                sdp: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    };
}

// Handle incoming offer
socket.on('offer', async (data) => {
    if (!peerConnection) {
        createPeerConnection();
    }
    
    await peerConnection.setRemoteDescription(data.sdp);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', {
        target: data.from,
        sdp: answer
    });
});

// Handle incoming answer
socket.on('answer', async (data) => {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.sdp);
    }
});

// Handle ICE candidate
socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Error adding received ice candidate:', error);
        }
    }
});

// Disconnect from current partner
function disconnect() {
    if (roomId) {
        // Leave the room
        socket.emit('leave', { roomId });
        roomId = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Reset UI
    remoteVideo.srcObject = null;
    disconnectButton.disabled = true;
    newPartnerButton.disabled = true;
    connectButton.disabled = false;
    document.querySelector('.video-container').classList.remove('connected');
    statusIndicator.textContent = 'Disconnected. Click "Find Partner" to connect again.';
}

// Find a new partner
function findNewPartner() {
    statusIndicator.textContent = 'Looking for a new partner...';
    socket.emit('new-partner');
    remoteVideo.srcObject = null;
    document.querySelector('.video-container').classList.remove('connected');
    
    // Close existing connection if any
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    disconnectButton.disabled = true;
    newPartnerButton.disabled = true;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (peerConnection) {
        peerConnection.close();
    }
});

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);