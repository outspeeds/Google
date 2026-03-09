const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 10e6 // 10MB
});

const PORT = process.env.PORT || 3000;
const SECRET_PHRASE = "admin123"; // Secret phrase for clearing messages

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const ensureDir = async (dir) => {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
};

(async () => {
    await ensureDir('./data');
    await ensureDir('./uploads');
})();

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

// Data file paths
const MESSAGES_FILE = './data/messages.json';
const GAMES_FILE = './data/games.json';

// Initialize data files
const initDataFiles = async () => {
    try {
        await fs.access(MESSAGES_FILE);
    } catch {
        await fs.writeFile(MESSAGES_FILE, JSON.stringify([]));
    }
    
    try {
        await fs.access(GAMES_FILE);
    } catch {
        const defaultGames = [
            { id: 'mario', name: 'Super Mario', url: 'https://games-site.github.io/projects/mario/index.html', desc: 'The classic platforming adventure.' }
            // ... (keep your other games here)
        ];
        await fs.writeFile(GAMES_FILE, JSON.stringify(defaultGames, null, 2));
    }
};

initDataFiles();

// Helper functions
const readMessages = async () => {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
};

const writeMessages = async (messages) => {
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
};

// Track active users
const activeUsers = new Map(); // socketId -> username

// API Routes
app.get('/api/games', async (req, res) => {
    try {
        const data = await fs.readFile(GAMES_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load games' });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await readMessages();
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        // Fix: Return messages chronologically 
        const start = Math.max(0, messages.length - offset - limit);
        const end = Math.max(0, messages.length - offset);
        const paginatedMessages = messages.slice(start, end);
        
        res.json({
            messages: paginatedMessages,
            total: messages.length,
            hasMore: start > 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// Image upload endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const outputPath = `./uploads/compressed-${req.file.filename}`;
        
        await sharp(req.file.path)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);

        await fs.unlink(req.file.path);

        const imageUrl = `/uploads/compressed-${req.file.filename}`;
        res.json({ imageUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('register', (username) => {
        const existingUser = Array.from(activeUsers.values()).find(u => u === username);
        
        if (existingUser) {
            socket.emit('register-failed', 'Username already taken');
            return;
        }

        const oldUsername = activeUsers.get(socket.id);
        activeUsers.set(socket.id, username);
        socket.emit('register-success', username);
        
        if (oldUsername) {
            io.emit('user-name-changed', {
                oldUsername,
                newUsername: username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
        } else {
            io.emit('user-joined', {
                username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
        }
    });

    socket.on('send-message', async (data) => {
        const username = activeUsers.get(socket.id);
        
        if (!username) {
            socket.emit('error', 'Not registered');
            return;
        }

        const message = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            username,
            text: data.text,
            imageUrl: data.imageUrl || null,
            timestamp: new Date().toISOString()
        };

        try {
            const messages = await readMessages();
            messages.push(message);
            await writeMessages(messages);

            io.emit('new-message', message);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle clearing messages with the secret phrase
    socket.on('clear-messages', async (secretPhrase) => {
        if (secretPhrase === SECRET_PHRASE) {
            try {
                await writeMessages([]); 
                io.emit('messages-cleared'); 
            } catch (error) {
                console.error('Error clearing messages:', error);
                socket.emit('error', 'Failed to clear messages on the server.');
            }
        } else {
            socket.emit('error', 'Incorrect secret phrase.');
        }
    });

    socket.on('typing', () => {
        const username = activeUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-typing', username);
        }
    });

    socket.on('stop-typing', () => {
        const username = activeUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-stop-typing', username);
        }
    });

    socket.on('disconnect', () => {
        const username = activeUsers.get(socket.id);
        
        if (username) {
            activeUsers.delete(socket.id);
            io.emit('user-left', {
                username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});