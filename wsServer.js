const WebSocket = require('ws');
const { TaskService, TeamService } = require('./services');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('WebSocket connection established');

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const { type, data } = JSON.parse(message);
      switch (type) {
        case 'taskUpdate':
          await TaskService.updateTask(data);
          broadcastTaskUpdate(data);
          break;
        case 'teamActivity':
          await TeamService.logActivity(data);
          broadcastTeamActivity(data);
          break;
        // Handle other message types
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({ error: 'InvalidMessage' }));
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Broadcast task update to all connected clients
function broadcastTaskUpdate(taskData) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'taskUpdate', data: taskData }));
    }
  });
}

// Broadcast team activity to all connected clients
function broadcastTeamActivity(activityData) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'teamActivity', data: activityData }));
    }
  });
}
