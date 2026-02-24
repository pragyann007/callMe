import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';


dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const DEV_FRONTEND_URL = process.env.DEV_FRONTEND_URL;
const PROD_FRONTEND_URL = process.env.PROD_FRONTEND_URL;

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? process.env.PROD_FRONTEND_URL : process.env.DEV_FRONTEND_URL,
        methods: ['GET', 'POST'],
    },
});


app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? PROD_FRONTEND_URL : DEV_FRONTEND_URL,
}));

app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from the backend!' });
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
});
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

