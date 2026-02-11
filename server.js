const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// File to store chat history
const MSG_PATH = path.join(__dirname, 'messages.json');

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Initialize messages file if it doesn't exist
if (!fs.existsSync(MSG_PATH)) {
    fs.writeFileSync(MSG_PATH, JSON.stringify([]));
}

// --- API: Get Messages (with pagination for scroll-up) ---
app.get('/api/messages', (req, res) => {
    try {
        const raw = fs.readFileSync(MSG_PATH);
        const allMessages = JSON.parse(raw);
        
        const limit = 20; // Load 20 at a time
        const offset = parseInt(req.query.offset) || 0;
        
        // Calculate slice indices
        const start = Math.max(0, allMessages.length - offset - limit);
        const end = Math.max(0, allMessages.length - offset);
        
        const chunk = allMessages.slice(start, end);
        
        // Return chunk and total count so frontend knows when to stop
        res.json({ messages: chunk, total: allMessages.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// --- Socket.io: Real-time Chat ---
io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        // Validate input
        if (!data.user || !data.text) return;

        const newMsg = {
            user: data.user,
            text: data.text,
            timestamp: new Date().toISOString()
        };

        // 1. Read current file
        const raw = fs.readFileSync(MSG_PATH);
        const messages = JSON.parse(raw);

        // 2. Append new message
        messages.push(newMsg);

        // 3. Save back to file (Sync for simplicity in this project)
        fs.writeFileSync(MSG_PATH, JSON.stringify(messages));

        // 4. Broadcast to everyone
        io.emit('chat message', newMsg);
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});