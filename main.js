const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

// ============================================================
// ELECTRON MAIN PROCESS
// ============================================================
// This is the main entry point for the Electron application.
// It creates the application window and manages the app lifecycle.

let mainWindow;
let wss;
let server;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#1a1a2e',
    title: 'Cloud Analytics Dashboard'
  });

  // Load the HTML file
  mainWindow.loadFile('index.html');

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// BACKEND SERVER INTEGRATION
// ============================================================

/**
 * Generate random analytics data for simulation
 */
function generateAnalyticsData() {
  const categories = ['sales', 'traffic', 'users', 'revenue'];
  const sources = ['web', 'mobile', 'api'];
  
  return {
    timestamp: Date.now(),
    category: categories[Math.floor(Math.random() * categories.length)],
    source: sources[Math.floor(Math.random() * sources.length)],
    value: Math.floor(Math.random() * 1000) + 100,
    views: Math.floor(Math.random() * 5000) + 1000,
    activeUsers: Math.floor(Math.random() * 500) + 50,
    revenue: (Math.random() * 10000).toFixed(2),
    conversionRate: (Math.random() * 10).toFixed(2)
  };
}

/**
 * Generate historical data for charts
 */
function generateHistoricalData(days = 30) {
  const data = [];
  const now = Date.now();
  
  for (let i = days; i >= 0; i--) {
    const timestamp = now - (i * 24 * 60 * 60 * 1000);
    data.push({
      timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],
      views: Math.floor(Math.random() * 10000) + 2000,
      sales: Math.floor(Math.random() * 5000) + 500,
      users: Math.floor(Math.random() * 2000) + 200,
      revenue: (Math.random() * 20000).toFixed(2),
      traffic: Math.floor(Math.random() * 15000) + 3000
    });
  }
  
  return data;
}

/**
 * Calculate statistics from data
 */
function calculateStatistics(data, mapping = null) {
  if (data.length === 0) {
    return {};
  }
  
  // If mapping is provided, calculate statistics for all dynamic metrics
  if (mapping) {
    const statistics = {};
    Object.keys(mapping).forEach(metric => {
      const columnName = mapping[metric];
      const total = data.reduce((sum, item) => {
        if (item[columnName] !== undefined) {
          return sum + parseFloat(item[columnName] || 0);
        }
        return sum + (parseFloat(item[metric]) || 0);
      }, 0);
      statistics[metric] = total;
    });
    return statistics;
  }
  
  // Fallback to fixed metrics for default data
  const totalViews = data.reduce((sum, item) => sum + (item.views || 0), 0);
  const activeUsers = data.reduce((sum, item) => sum + (item.users || item.activeUsers || 0), 0);
  const totalRevenue = data.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0);
  const avgConversionRate = data.reduce((sum, item) => sum + parseFloat(item.conversionRate || 0), 0) / data.length;
  
  return {
    totalViews,
    activeUsers,
    totalRevenue: totalRevenue.toFixed(2),
    avgConversionRate: avgConversionRate.toFixed(2)
  };
}

/**
 * Start WebSocket server
 */
function startWebSocketServer() {
  server = http.createServer();
  wss = new WebSocket.Server({ server });
  
  const clients = new Set();
  let historicalData = generateHistoricalData(30);
  let useUploadedData = false; // Flag to track if user uploaded their own data
  let historicalInterval = null;
  let columnMapping = null; // Store column mapping from uploaded data
  
  wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);
    
    // Send initial historical data
    ws.send(JSON.stringify({
      type: 'initial',
      historicalData: historicalData,
      statistics: calculateStatistics(historicalData)
    }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'filter') {
          ws.send(JSON.stringify({
            type: 'filtered',
            data: historicalData,
            statistics: calculateStatistics(historicalData)
          }));
        }
        
        // Handle uploaded data
        if (data.type === 'upload_data') {
          console.log('Received uploaded data:', data.data.length, 'rows');
          console.log('Sample uploaded data:', data.data[0]);
          
          historicalData = data.data;
          columnMapping = data.columnMapping; // Store the column mapping
          useUploadedData = true; // Stop real-time simulation
          
          const stats = calculateStatistics(historicalData, columnMapping);
          console.log('Calculated statistics from uploaded data:', stats);
          
          // Clear the interval to stop generating mock data
          if (historicalInterval) {
            console.log('Clearing historicalInterval');
            clearInterval(historicalInterval);
            historicalInterval = null;
          }
          
          // Broadcast updated data to all clients
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              console.log('Broadcasting updated data to client');
              client.send(JSON.stringify({
                type: 'initial',
                historicalData: historicalData,
                statistics: stats,
                columnMapping: columnMapping, // Send column mapping back to client
                useUploadedData: true // Notify client to stop real-time chart
              }));
            }
          });
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
    });
  });
  
  // Update historical data every 30 seconds (only if using mock data)
  historicalInterval = setInterval(() => {
    if (useUploadedData) {
      // Stop updating historical data if user uploaded their own data
      return;
    }
    
    const newData = generateAnalyticsData();
    historicalData.push({
      ...newData,
      date: new Date(newData.timestamp).toISOString().split('T')[0],
      views: newData.views,
      sales: newData.value,
      users: newData.activeUsers,
      traffic: newData.views + Math.floor(Math.random() * 5000)
    });
    
    // Keep only last 90 days
    if (historicalData.length > 90) {
      historicalData.shift();
    }
    
    // Broadcast updated statistics
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'statistics',
          statistics: calculateStatistics(historicalData)
        }));
      }
    });
  }, 30000);
  
  server.listen(8080, () => {
    console.log(`WebSocket server running on port 8080`);
  });
}

/**
 * App event listeners
 */
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startWebSocketServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================
// IPC HANDLERS FOR WINDOW CONTROLS
// ============================================================

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
