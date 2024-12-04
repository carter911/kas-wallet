import express from 'express';
import dotenv from 'dotenv';
// Load environment variables
const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });
// Global WebSocket setup
globalThis.WebSocket = require('websocket').w3cwebsocket;


import {rpcPool,taskQueue} from "./middleware";



app.use((req, _, next) => {
    try {
        req.pool = rpcPool;
        req.taskQueue = taskQueue;
        next();
    } catch (error) {
        console.error('Error in middleware:', error);
        next(error);
    }
});

// Register routes
import router from './routes/index';
app.use('/', router);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    try {
        if(rpcPool){
            await rpcPool.closeAll(); // Clean up RPC connections
        }
        console.log('RPC connections closed');
    } catch (error) {
        console.error('Error closing RPC connections:', error);
    }
    process.exit(0);
});
