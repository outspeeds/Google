const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

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
            { id: 'mario', name: 'Super Mario', url: 'https://games-site.github.io/projects/mario/index.html', desc: 'The classic platforming adventure.' },
            { id: 'paperio', name: 'Paper.io 2', url: 'https://games-site.github.io/projects/paperio2/index.html', desc: 'Conquer as much territory as possible.' },
            { id: 'pacman', name: 'Pac-Man', url: 'https://games-site.github.io/projects/pacman/index.html', desc: 'Navigate the maze and eat the dots.' },
            { id: 'ballsort', name: 'Ball Sort Puzzle', url: 'https://games-site.github.io/projects/ball-sort-puzzle/index.html', desc: 'Sort the colored balls in the tubes.' },
            { id: 'cookie', name: 'Cookie Clicker', url: 'https://games-site.github.io/projects/cookie-clicker/index.html', desc: 'Bake an infinite amount of cookies.' },
            { id: 'coreball', name: 'Core Ball', url: 'https://games-site.github.io/projects/core-ball/index.html', desc: 'Test your timing and precision.' },
            { id: 'deathrun', name: 'Death Run 3D', url: 'https://games-site.github.io/projects/death-run-3d/index.html', desc: 'Fast-paced tube runner.' },
            { id: 'drifthunters', name: 'Drift Hunters', url: 'https://games-site.github.io/projects/drift-hunters/index.html', desc: 'Detailed 3D drifting simulator.' },
            { id: 'alc2', name: 'Little Alchemy 2', url: 'https://gamingshitposting.github.io/ext-bin-1/littlealchemy2.com/index.html', desc: 'Mix elements and create the world.' },
            { id: 'totm', name: 'Tomb of the Mask', url: 'https://gamingshitposting.github.io/ext-bin-1/web-portal-testing.pg.io/4yuEwaHwXK74EMazDK9Z7rl32xa9w0Pf/totm/latest/index.html', desc: 'Explore a vertical labyrinth.' },
            { id: 'eagler', name: 'Eaglercraft 1.8', url: 'https://gamingshitposting.github.io/ext-bin-1/games/EaglercraftX_1.8_u27_Offline_Signed.html', desc: 'Browser-based voxel survival.' },
            { id: 'stack', name: 'Stack', url: 'https://gamingshitposting.github.io/ext-bin-1/games/stack/index.html', desc: 'Stack blocks to reach the sky.' },
            { id: 'alc1', name: 'Little Alchemy', url: 'https://sciencemathedu.github.io/littlealchemy/', desc: 'Original element logic game.' },
            { id: '2048', name: '2048', url: 'https://games-site.github.io/projects/2048/index.html', desc: 'Slide tiles to reach 2048.' },
            { id: 'bitlife', name: 'BitLife', url: 'https://games-site.github.io/projects/bitlife/index.html', desc: 'Simulate an entire life.' },
            { id: 'doodle', name: 'Doodle Jump', url: 'https://games-site.github.io/projects/doodle-jump/index.html', desc: 'Classic endless jumper.' },
            { id: 'drift-boss', name: 'Drift Boss', url: 'https://games-site.github.io/projects/drift-boss/index.html', desc: 'Drifting car physics game.' },
            { id: 'flappy', name: 'Flappy Bird', url: 'https://games-site.github.io/projects/flappy-bird/index.html', desc: 'Fly through the pipes.' },
            { id: 'feud', name: 'Google Feud', url: 'https://games-site.github.io/projects/google-feud/index.html', desc: 'Autocomplete guessing game.' },
            { id: 'mines', name: 'Minesweeper', url: 'https://games-site.github.io/projects/minesweeper/index.html', desc: 'Classic logic mine-clearing.' },
            { id: 'doge', name: 'Save the Doge', url: 'https://games-site.github.io/projects/save-the-doge/index.html', desc: 'Protect the doge from bees.' }
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
        
        // Return messages in reverse order (newest first) for pagination
        const paginatedMessages = messages.slice(-offset - limit, messages.length - offset).reverse();
        
        res.json({
            messages: paginatedMessages,
            total: messages.length,
            hasMore: offset + limit < messages.length
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
        
        // Compress and resize image
        await sharp(req.file.path)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);

        // Delete original if compression successful
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

    // Handle username registration
    socket.on('register', (username) => {
        // Check if username is already taken
        const existingUser = Array.from(activeUsers.values()).find(u => u === username);
        
        if (existingUser) {
            socket.emit('register-failed', 'Username already taken');
            return;
        }

        const oldUsername = activeUsers.get(socket.id);
        activeUsers.set(socket.id, username);
        socket.emit('register-success', username);
        
        if (oldUsername) {
            // User changed their name
            io.emit('user-name-changed', {
                oldUsername,
                newUsername: username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
        } else {
            // New user joined
            io.emit('user-joined', {
                username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
        }

        console.log(`User registered: ${username}`);
    });

    // Handle new messages
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

        // Save message to file
        try {
            const messages = await readMessages();
            messages.push(message);
            await writeMessages(messages);

            // Broadcast to all clients
            io.emit('new-message', message);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle typing indicator
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

    // Handle disconnection
    socket.on('disconnect', () => {
        const username = activeUsers.get(socket.id);
        
        if (username) {
            activeUsers.delete(socket.id);
            io.emit('user-left', {
                username,
                timestamp: new Date().toISOString(),
                activeUsers: Array.from(activeUsers.values())
            });
            console.log(`User disconnected: ${username}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});