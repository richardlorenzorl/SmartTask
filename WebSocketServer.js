import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

export default function CreateWebSocketServer(server, JWT_SECRET) {
    const wss = new WebSocket.Server({ server });
    const clients = new Map();

    // Client connection tracking
    class ClientConnection {
        constructor(ws, userId, subscriptions = new Set()) {
            this.ws = ws;
            this.userId = userId;
            this.subscriptions = subscriptions;
            this.pingTimeout = null;
        }

        subscribe(channel) {
            this.subscriptions.add(channel);
        }

        unsubscribe(channel) {
            this.subscriptions.delete(channel);
        }

        resetPingTimeout() {
            if (this.pingTimeout) clearTimeout(this.pingTimeout);
            this.pingTimeout = setTimeout(() => {
                this.ws.terminate();
            }, 30000);
        }
    }

    // Handle new WebSocket connections
    wss.on('connection', async (ws, req) => {
        try {
            // Extract and verify JWT token
            const token = req.url.split('token=')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            const userId = decoded.userId;

            // Create new client connection
            const client = new ClientConnection(ws, userId);
            clients.set(ws, client);

            // Setup ping-pong heartbeat
            client.resetPingTimeout();

            ws.on('pong', () => {
                client.resetPingTimeout();
            });

            // Handle incoming messages
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    handleClientMessage(client, data);
                } catch (error) {
                    sendError(ws, 'Invalid message format');
                }
            });

            // Handle client disconnect
            ws.on('close', () => {
                if (client.pingTimeout) clearTimeout(client.pingTimeout);
                clients.delete(ws);
            });

            // Subscribe to user-specific channel
            client.subscribe(`user:${userId}`);
            
            // Send initial connection success
            sendMessage(ws, {
                type: 'connection_established',
                data: { userId }
            });

        } catch (error) {
            sendError(ws, 'Authentication failed');
            ws.close();
        }
    });

    // Handle different types of client messages
    async function handleClientMessage(client, message) {
        switch (message.type) {
            case 'subscribe':
                handleSubscribe(client, message.channel);
                break;
            case 'unsubscribe':
                handleUnsubscribe(client, message.channel);
                break;
            case 'task_update':
                handleTaskUpdate(client, message.data);
                break;
            case 'ping':
                sendMessage(client.ws, { type: 'pong' });
                break;
            default:
                sendError(client.ws, 'Unknown message type');
        }
    }

    // Subscription handlers
    function handleSubscribe(client, channel) {
        // Verify channel access permissions
        if (canAccessChannel(client.userId, channel)) {
            client.subscribe(channel);
            sendMessage(client.ws, {
                type: 'subscribed',
                channel
            });
        } else {
            sendError(client.ws, 'Subscription denied');
        }
    }

    function handleUnsubscribe(client, channel) {
        client.unsubscribe(channel);
        sendMessage(client.ws, {
            type: 'unsubscribed',
            channel
        });
    }

    // Task update handler
    async function handleTaskUpdate(client, data) {
        try {
            // Verify task update permissions
            const hasPermission = await verifyTaskPermission(
                client.userId, 
                data.taskId
            );
            
            if (!hasPermission) {
                throw new Error('Permission denied');
            }

            // Broadcast update to relevant clients
            broadcastTaskUpdate(data);

        } catch (error) {
            sendError(client.ws, error.message);
        }
    }

    // Broadcasting functions
    function broadcastTaskUpdate(taskData) {
        const relevantChannels = [
            `task:${taskData.taskId}`,
            `project:${taskData.projectId}`,
            `team:${taskData.teamId}`
        ];

        for (const [ws, client] of clients) {
            const shouldReceive = relevantChannels.some(channel => 
                client.subscriptions.has(channel)
            );

            if (shouldReceive) {
                sendMessage(ws, {
                    type: 'task_updated',
                    data: taskData
                });
            }
        }
    }

    // Utility functions
    function sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    function sendError(ws, error) {
        sendMessage(ws, {
            type: 'error',
            error
        });
    }

    async function verifyTaskPermission(userId, taskId) {
        // Placeholder implementation of permission verification
        // This would check role permissions and team membership
        return true;
    }

    function canAccessChannel(userId, channel) {
        // Channel access verification logic
        const [type, id] = channel.split(':');
        
        // Allow user-specific channels
        if (type === 'user' && id === userId) {
            return true;
        }

        // Placeholder: Other channel types would need additional verification
        return true;
    }

    // Periodic ping to keep connections alive
    setInterval(() => {
        for (const [ws, client] of clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }
    }, 15000);

    return {
        broadcast: broadcastTaskUpdate,
        getConnectedUsers: () => {
            return Array.from(clients.values()).map(client => client.userId);
        }
    };
}
