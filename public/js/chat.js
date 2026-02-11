const socket = io();

let username = '';
let currentImageFile = null;
let isLoadingMessages = false;
let allMessagesLoaded = false;
let messageOffset = 0;
const MESSAGE_BATCH_SIZE = 30;
let typingTimeout;

// Theme management
function toggleDarkMode() {
    const currentTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('chat-theme', currentTheme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('chat-theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
}

// Username registration
function registerUsername() {
    const input = document.getElementById('usernameInput');
    const name = input.value.trim();
    const errorMsg = document.getElementById('errorMessage');
    
    if (!name) {
        errorMsg.textContent = 'Please enter a username';
        errorMsg.style.display = 'block';
        return;
    }
    
    if (name.length < 2) {
        errorMsg.textContent = 'Username must be at least 2 characters';
        errorMsg.style.display = 'block';
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        errorMsg.textContent = 'Username can only contain letters, numbers, and underscores';
        errorMsg.style.display = 'block';
        return;
    }
    
    socket.emit('register', name);
}

// Socket event listeners
socket.on('register-success', (name) => {
    username = name;
    document.getElementById('usernameModal').classList.remove('active');
    loadInitialMessages();
});

socket.on('register-failed', (error) => {
    const errorMsg = document.getElementById('errorMessage');
    errorMsg.textContent = error;
    errorMsg.style.display = 'block';
});

socket.on('new-message', (message) => {
    addMessage(message, false);
});

socket.on('user-joined', (data) => {
    addSystemMessage(`${data.username} joined the chat`);
    updateActiveUsers(data.activeUsers);
});

socket.on('user-left', (data) => {
    addSystemMessage(`${data.username} left the chat`);
    updateActiveUsers(data.activeUsers);
});

socket.on('user-typing', (typingUsername) => {
    const indicator = document.getElementById('typingIndicator');
    const usernameSpan = document.getElementById('typingUsername');
    usernameSpan.textContent = typingUsername;
    indicator.classList.add('active');
});

socket.on('user-stop-typing', () => {
    const indicator = document.getElementById('typingIndicator');
    indicator.classList.remove('active');
});

// Load messages
async function loadInitialMessages() {
    try {
        const response = await fetch(`/api/messages?limit=${MESSAGE_BATCH_SIZE}&offset=${messageOffset}`);
        const data = await response.json();
        
        data.messages.forEach(msg => addMessage(msg, true));
        
        messageOffset += data.messages.length;
        allMessagesLoaded = !data.hasMore;
        
        // Scroll to bottom
        const chatContainer = document.getElementById('chatMessages');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

async function loadMoreMessages() {
    if (isLoadingMessages || allMessagesLoaded) return;
    
    isLoadingMessages = true;
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';
    
    const chatContainer = document.getElementById('chatMessages');
    const oldScrollHeight = chatContainer.scrollHeight;
    
    try {
        const response = await fetch(`/api/messages?limit=${MESSAGE_BATCH_SIZE}&offset=${messageOffset}`);
        const data = await response.json();
        
        if (data.messages.length > 0) {
            // Add messages at the top
            data.messages.forEach(msg => addMessage(msg, true));
            
            messageOffset += data.messages.length;
            allMessagesLoaded = !data.hasMore;
            
            // Maintain scroll position
            const newScrollHeight = chatContainer.scrollHeight;
            chatContainer.scrollTop = newScrollHeight - oldScrollHeight;
        } else {
            allMessagesLoaded = true;
        }
    } catch (error) {
        console.error('Failed to load more messages:', error);
    }
    
    loadingIndicator.style.display = 'none';
    isLoadingMessages = false;
}

// Scroll handling for progressive loading
document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chatMessages');
    
    chatContainer.addEventListener('scroll', () => {
        // Load more when scrolled to top (reversed scroll)
        if (chatContainer.scrollTop === 0) {
            loadMoreMessages();
        }
    });
});

// Message handling
function addMessage(message, prepend = false) {
    const chatContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.username === username ? 'my-message' : ''}`;
    
    const time = new Date(message.timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let imageHTML = '';
    if (message.imageUrl) {
        imageHTML = `<img src="${message.imageUrl}" class="message-image" onclick="window.open('${message.imageUrl}', '_blank')" alt="Shared image">`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(message.username)}</span>
            <span class="message-time">${timeString}</span>
        </div>
        <div class="message-content">
            ${escapeHtml(message.text)}
            ${imageHTML}
        </div>
    `;
    
    if (prepend) {
        // Add to top (for loading old messages)
        const firstMessage = chatContainer.querySelector('.message, .system-message');
        if (firstMessage) {
            chatContainer.insertBefore(messageDiv, firstMessage);
        } else {
            chatContainer.appendChild(messageDiv);
        }
    } else {
        // Add to bottom (for new messages)
        chatContainer.insertBefore(messageDiv, chatContainer.firstChild);
        
        // Auto-scroll if near bottom
        if (chatContainer.scrollTop < 100) {
            chatContainer.scrollTop = 0;
        }
    }
}

function addSystemMessage(text) {
    const chatContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    chatContainer.insertBefore(messageDiv, chatContainer.firstChild);
}

function updateActiveUsers(users) {
    const container = document.getElementById('activeUsers');
    container.innerHTML = '';
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div class="user-status"></div>
            ${escapeHtml(user)}
        `;
        container.appendChild(userDiv);
    });
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text && !currentImageFile) return;
    
    let imageUrl = null;
    
    // Upload image if present
    if (currentImageFile) {
        try {
            const formData = new FormData();
            formData.append('image', currentImageFile);
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            imageUrl = data.imageUrl;
        } catch (error) {
            console.error('Failed to upload image:', error);
            alert('Failed to upload image');
            return;
        }
    }
    
    // Send message
    socket.emit('send-message', {
        text: text || '',
        imageUrl: imageUrl
    });
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    removeImagePreview();
    socket.emit('stop-typing');
}

// Image handling
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Image must be smaller than 10MB');
        event.target.value = '';
        return;
    }
    
    currentImageFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('imagePreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    event.target.value = '';
}

function removeImagePreview() {
    currentImageFile = null;
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('previewImage').src = '';
}

// Input handlers
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('messageInput');
    const usernameInput = document.getElementById('usernameInput');
    
    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        
        // Typing indicator
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop-typing');
        }, 1000);
    });
    
    // Send on Enter (but Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Username input Enter key
    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            registerUsername();
        }
    });
});

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
initTheme();