const socket = io();
let currentUsername = null;
let currentImageUrl = null;
let typingTimeout = null;
let isHistoryLoaded = false; // Flag to delay system messages

const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const clearChatModal = document.getElementById('clearChatModal');
const clearInput = document.getElementById('clearInput');

// ==========================================
// INITIALIZATION & LOADING
// ==========================================

async function loadInitialMessages() {
    try {
        const response = await fetch('/api/messages?limit=50&offset=0');
        const data = await response.json();
        
        chatMessages.innerHTML = ''; 

        data.messages.reverse().forEach(msg => {
            chatMessages.appendChild(createMessageElement(msg));
        });
        
        // Mark history as loaded so system messages can now show up
        isHistoryLoaded = true;
    } catch (error) {
        console.error('Failed to fetch initial messages:', error);
    }
}
loadInitialMessages();

// ==========================================
// MODAL MANAGEMENT & DISMISSAL
// ==========================================

// Close modal when clicking on the dark background
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target.id);
    }
});

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        const input = modal.querySelector('input');
        if (input) input.value = ''; // Clear text box
        
        // Hide any errors specific to that modal
        const err = modal.querySelector('.error-message');
        if (err) err.style.display = 'none';
    }
}

// ==========================================
// USERNAME REGISTRATION
// ==========================================

function registerUsername() {
    const val = usernameInput.value.trim();
    if (!val) {
        showError('usernameError', "Username cannot be empty");
        return;
    }
    socket.emit('register', val);
}

function showUsernameChange() {
    usernameModal.classList.add('active');
    usernameInput.value = currentUsername || '';
    usernameInput.focus();
}

function showError(elementId, msg) {
    const err = document.getElementById(elementId);
    err.textContent = msg;
    err.style.display = 'block';
}

socket.on('register-success', (username) => {
    currentUsername = username;
    document.getElementById('displayUsername').textContent = username;
    closeModal('usernameModal');
});

socket.on('register-failed', (msg) => {
    showError('usernameError', msg);
});

// ==========================================
// SENDING & RECEIVING MESSAGES
// ==========================================

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !currentImageUrl) return;

    socket.emit('send-message', {
        text: text,
        imageUrl: currentImageUrl
    });

    messageInput.value = '';
    removeImagePreview();
    socket.emit('stop-typing');
}

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

socket.on('new-message', (msg) => {
    const msgElement = createMessageElement(msg);
    chatMessages.prepend(msgElement); 
});

function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = 'message ' + (msg.username === currentUsername ? 'my-message' : '');
    
    let timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    let imageHtml = '';
    if (msg.imageUrl) {
        imageHtml = `<img src="${msg.imageUrl}" class="message-image" alt="Image attachment" onclick="window.open('${msg.imageUrl}', '_blank')">`;
    }

    div.innerHTML = `
        <div class="message-header">
            <span class="message-username">${msg.username}</span>
            <span class="message-time">${timeString}</span>
        </div>
        <div class="message-content">
            ${msg.text.replace(/\n/g, '<br>')}
            ${imageHtml}
        </div>
    `;
    return div;
}

// ==========================================
// SYSTEM MESSAGES (JOIN/LEFT)
// ==========================================

function addSystemMessage(text) {
    if (!isHistoryLoaded) return; // Wait until old messages are loaded
    
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    // Prepend drops it at the very bottom of the chat visually
    chatMessages.prepend(div);
}

// ==========================================
// CLEAR MESSAGES LOGIC
// ==========================================

function showClearChatModal() {
    clearChatModal.classList.add('active');
    clearInput.focus();
}

function submitClearChat() {
    const secret = clearInput.value.trim();
    if (!secret) {
        showError('clearError', "Please enter a phrase.");
        return;
    }
    socket.emit('clear-messages', secret);
}

// Listen for custom server errors related to clearing the chat
socket.on('error', (msg) => {
    if (clearChatModal.classList.contains('active')) {
        showError('clearError', msg);
    } else {
        alert(msg);
    }
});

socket.on('messages-cleared', () => {
    chatMessages.innerHTML = '';
    closeModal('clearChatModal');
});

// ==========================================
// IMAGE UPLOAD LOGIC
// ==========================================

async function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.imageUrl) {
            currentImageUrl = data.imageUrl;
            document.getElementById('previewImage').src = data.imageUrl;
            document.getElementById('imagePreview').style.display = 'block';
        }
    } catch (err) {
        alert('Failed to upload image');
    }
}

function removeImagePreview() {
    currentImageUrl = null;
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('imageInput').value = '';
}

// ==========================================
// TYPING INDICATORS & ACTIVE USERS
// ==========================================

messageInput.addEventListener('input', () => {
    socket.emit('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop-typing');
    }, 1000);
});

socket.on('user-typing', (username) => {
    document.getElementById('typingUsername').textContent = username;
    document.getElementById('typingIndicator').classList.add('active');
});

socket.on('user-stop-typing', (username) => {
    document.getElementById('typingIndicator').classList.remove('active');
});

function updateActiveUsers(users) {
    const container = document.getElementById('activeUsers');
    container.innerHTML = users.map(u => `
        <div class="user-item">
            <div class="user-status"></div>
            ${u}
        </div>
    `).join('');
}

// Tie into the system message helper
socket.on('user-joined', (data) => {
    updateActiveUsers(data.activeUsers);
    addSystemMessage(`${data.username} joined the chat`);
});

socket.on('user-left', (data) => {
    updateActiveUsers(data.activeUsers);
    addSystemMessage(`${data.username} left the chat`);
});

socket.on('user-name-changed', (data) => {
    updateActiveUsers(data.activeUsers);
    addSystemMessage(`${data.oldUsername} changed their name to ${data.newUsername}`);
});

// ==========================================
// DARK MODE
// ==========================================
function toggleDarkMode() {
    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'dark');
    }
}

// Show modal on load
window.onload = () => {
    usernameModal.classList.add('active');
    usernameInput.focus();
};