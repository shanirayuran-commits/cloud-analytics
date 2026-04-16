// ============================================================
// ELECTRON RENDERER PROCESS
// ============================================================
// This script runs in the renderer process and handles:
// - Chart.js integration for interactive charts with zoom
// - WebSocket client for real-time data
// - AI-powered analysis (anomaly detection, predictions, insights)
// - Data comparison between time periods
// - Theme toggle (dark/light)
// - Keyboard shortcuts
// - Notifications system
// - Performance metrics
// - Data caching and offline mode
// - Export functionality (PNG, CSV, PDF)
// - Report generation
// - Window controls (close, minimize, maximize)

// ============================================================
// GLOBAL VARIABLES
// ============================================================
let ws = null;
let isOffline = true;
let currentSection = 'dashboard';
let historicalData = [];
let cachedData = null;
let charts = {};
let dataUpdated = false; // Flag to track when data has been updated
let performanceMetrics = {
  latency: 0,
  connectionQuality: 'Unknown',
  lastUpdate: null
};
let useUploadedData = false; // Flag to track if user uploaded their own data
let notificationCount = 0;

// Google Gemini API Configuration
const GEMINI_API_KEY = 'AIzaSyBvgt-Zcv271NU6fmoylihXUTB6IWRMUzI';

/**
 * Generate dynamic stat cards based on column mapping
 * @param {Object} columnMapping - Mapping of metrics to column names
 */
function generateDynamicStatCards(columnMapping) {
  const statsGrid = document.querySelector('.stats-grid');
  if (!statsGrid) return;
  
  // Clear existing cards
  statsGrid.innerHTML = '';
  
  // Generate cards for each metric in the mapping
  Object.entries(columnMapping).forEach(([metric, columnName], index) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    
    // Format column name for display
    const displayName = columnName.charAt(0).toUpperCase() + columnName.slice(1);
    
    // Assign icon based on index (cycle through available icons)
    const icons = ['eye', 'users', 'dollar-sign', 'percent', 'trending-up', 'bar-chart', 'pie-chart', 'activity'];
    const iconClass = icons[index % icons.length];
    
    card.innerHTML = `
      <div class="stat-icon">
        <i data-lucide="${iconClass}"></i>
      </div>
      <div class="stat-content">
        <h3>${displayName}</h3>
        <p class="stat-value" id="metric-${index}">0</p>
        <p class="stat-change positive">+0%</p>
      </div>
    `;
    
    statsGrid.appendChild(card);
  });
  
  // Re-initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Update dynamic stat cards with statistics
 * @param {Object} statistics - Statistics object with metric values
 */
function updateDynamicStatCards(statistics) {
  Object.entries(statistics).forEach(([metric, value], index) => {
    const element = document.getElementById(`metric-${index}`);
    if (element) {
      // Format the value
      const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
      element.textContent = formattedValue;
    }
  });
}

/**
 * Analyze Excel columns with AI to suggest intelligent mappings and chart configurations
 * @param {Array} columns - Array of column names from Excel file
 * @param {Array} sampleData - Sample row of data to understand column types
 * @returns {Promise<Object>} Suggested column mapping and chart configurations
 */
async function analyzeColumnsWithAI(columns, sampleData) {
  try {
    const prompt = `
You are a data analyst. Analyze these Excel columns and create a mapping for a dynamic dashboard.

Columns: ${JSON.stringify(columns)}
Sample data: ${JSON.stringify(sampleData)}

Return ONLY a JSON object with this structure:
{
  "columnMapping": {
    "metric1": "column_name_1",
    "metric2": "column_name_2",
    "metric3": "column_name_3"
  },
  "chartConfig": {
    "lineChart": ["metric1", "metric2"],
    "barChart": ["metric1", "metric3"],
    "pieChart": ["metric1", "metric2", "metric3"]
  }
}

For numeric columns, create metric names like: metric1, metric2, metric3, etc.
Suggest which metrics should go in which charts based on data types and relationships.
Include ALL numeric columns in the mapping. Return only JSON, no explanation.
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Gemini API error:', data.error);
      return null;
    }

    const aiResponse = data.candidates[0].content.parts[0].text;
    const aiResult = JSON.parse(aiResponse);
    
    console.log('AI-suggested column mapping:', aiResult.columnMapping);
    console.log('AI-suggested chart configuration:', aiResult.chartConfig);
    
    // Store chart configuration globally
    if (aiResult.chartConfig) {
      window.chartConfig = aiResult.chartConfig;
    }
    
    return aiResult.columnMapping;
    
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return null;
  }
}

// ============================================================
// CHART CONFIGURATION
// ============================================================

/**
 * Get chart colors based on current theme
 */
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    text: isDark ? '#ffffff' : '#1a1a1a',
    grid: isDark ? '#333333' : '#e0e0e0',
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
  };
}

/**
 * Chart.js default configuration with zoom support
 */
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      labels: {
        color: getChartColors().text,
        font: {
          size: 12,
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      }
    },
    zoom: {
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'x',
      },
      pan: {
        enabled: true,
        mode: 'x',
      }
    }
  },
  scales: {
    x: {
      ticks: {
        color: getChartColors().text,
        font: {
          size: 11
        }
      },
      grid: {
        color: getChartColors().grid
      }
    },
    y: {
      ticks: {
        color: getChartColors().text,
        font: {
          size: 11
        }
      },
      grid: {
        color: getChartColors().grid
      }
    }
  }
};

// ============================================================
// CHART INITIALIZATION
// ============================================================

/**
 * Initialize all charts on page load
 */
function initializeCharts() {
  const colors = getChartColors();
  
  // Line Chart - Views & Sales Over Time
  const lineCtx = document.getElementById('lineChart').getContext('2d');
  charts.line = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Views',
          data: [],
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}20`,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5
        },
        {
          label: 'Sales',
          data: [],
          borderColor: colors.secondary,
          backgroundColor: `${colors.secondary}20`,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      ...chartDefaults,
      animation: {
        duration: 300
      },
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          display: true,
          position: 'bottom'
        }
      }
    }
  });

  // Pie Chart - Category Distribution
  const pieCtx = document.getElementById('pieChart').getContext('2d');
  charts.pie = new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels: ['Sales', 'Traffic', 'Users', 'Revenue'],
      datasets: [{
        data: [25, 30, 25, 20],
        backgroundColor: [
          colors.primary,
          colors.secondary,
          colors.success,
          colors.warning
        ],
        borderWidth: 2,
        borderColor: getChartColors().grid
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: colors.text,
            padding: 15,
            font: {
              size: 11
            }
          }
        }
      }
    }
  });

  // Main Line Chart (separate section)
  const mainLineCtx = document.getElementById('mainLineChart').getContext('2d');
  charts.mainLine = new Chart(mainLineCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Views',
          data: [],
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}20`,
          tension: 0.4
        },
        {
          label: 'Sales',
          data: [],
          borderColor: colors.secondary,
          backgroundColor: `${colors.secondary}20`,
          tension: 0.4
        },
        {
          label: 'Users',
          data: [],
          borderColor: colors.success,
          backgroundColor: `${colors.success}20`,
          tension: 0.4
        }
      ]
    },
    options: chartDefaults
  });

  // Main Bar Chart
  const mainBarCtx = document.getElementById('mainBarChart').getContext('2d');
  charts.mainBar = new Chart(mainBarCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Views',
          data: [],
          backgroundColor: colors.primary
        },
        {
          label: 'Traffic',
          data: [],
          backgroundColor: colors.secondary
        }
      ]
    },
    options: chartDefaults
  });

  // Main Pie Chart
  const mainPieCtx = document.getElementById('mainPieChart').getContext('2d');
  charts.mainPie = new Chart(mainPieCtx, {
    type: 'pie',
    data: {
      labels: ['Sales', 'Traffic', 'Users', 'Revenue'],
      datasets: [{
        data: [25, 30, 25, 20],
        backgroundColor: [
          colors.primary,
          colors.secondary,
          colors.success,
          colors.warning
        ],
        borderWidth: 2,
        borderColor: getChartColors().grid
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: colors.text,
            padding: 15,
            font: {
              size: 11
            }
          }
        }
      }
    }
  });

  // Performance Chart
  const perfCtx = document.getElementById('performanceChart');
  if (perfCtx) {
    charts.performance = new Chart(perfCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Latency (ms)',
          data: [],
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}20`,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        ...chartDefaults,
        plugins: {
          ...chartDefaults.plugins,
          zoom: undefined // Disable zoom for performance chart
        }
      }
    });
  }
}

// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

/**
 * Establish WebSocket connection to backend
 */
function connectWebSocket() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  statusText.textContent = 'Connecting...';
  statusDot.classList.remove('connected');
  isOffline = true;

  const startTime = Date.now();

  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('WebSocket connected');
    const latency = Date.now() - startTime;
    performanceMetrics.latency = latency;
    performanceMetrics.connectionQuality = latency < 100 ? 'Excellent' : latency < 300 ? 'Good' : 'Fair';
    
    statusText.textContent = 'Connected';
    statusDot.classList.add('connected');
    isOffline = false;
    
    updatePerformanceMetrics();
    addNotification('Connected to server', 'success');
    
    // Request cached data if available
    if (cachedData) {
      updateDashboard(cachedData.statistics);
      updateCharts(cachedData.historicalData);
    }
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const latency = Date.now() - (message.timestamp || Date.now());
    performanceMetrics.latency = Math.round(latency);
    performanceMetrics.lastUpdate = new Date().toLocaleTimeString();
    
    handleWebSocketMessage(message);
    updatePerformanceMetrics();
    
    // Cache the data for offline mode
    if (message.type === 'initial' || message.type === 'statistics') {
      cachedData = message;
      localStorage.setItem('analyticsCache', JSON.stringify(message));
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusText.textContent = 'Error';
    statusDot.classList.remove('connected');
    isOffline = true;
    performanceMetrics.connectionQuality = 'Poor';
    updatePerformanceMetrics();
    addNotification('Connection error occurred', 'error');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    statusText.textContent = 'Disconnected';
    statusDot.classList.remove('connected');
    isOffline = true;
    performanceMetrics.connectionQuality = 'Disconnected';
    updatePerformanceMetrics();
    
    // Load cached data if available
    loadCachedData();
    
    // Attempt to reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
}

/**
 * Load cached data for offline mode
 */
function loadCachedData() {
  const cached = localStorage.getItem('analyticsCache');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (data && data.historicalData && data.statistics) {
        cachedData = data;
        updateDashboard(data.statistics);
        updateCharts(data.historicalData);
        addNotification('Using cached data - offline mode', 'warning');
      } else {
        throw new Error('Invalid cache data structure');
      }
    } catch (e) {
      console.error('Error loading cached data:', e);
      // Clear corrupted cache
      localStorage.removeItem('analyticsCache');
    }
  }
}

/**
 * Handle incoming WebSocket messages
 * @param {Object} message - Parsed message from server
 */
function handleWebSocketMessage(message) {
  console.log('Received WebSocket message type:', message.type);
  
  switch (message.type) {
    case 'initial':
      console.log('Initial data received, data points:', message.historicalData.length);
      console.log('Statistics received:', message.statistics);
      
      historicalData = message.historicalData;
      performanceMetrics.dataPoints = historicalData.length;
      
      // Store column mapping if provided by server
      if (message.columnMapping) {
        window.columnMapping = message.columnMapping;
        console.log('Received column mapping from server:', message.columnMapping);
      }
      
      console.log('Updating dashboard with statistics');
      updateDashboard(message.statistics);
      
      console.log('Updating charts with historical data');
      updateCharts(historicalData);
      
      // Set flag that data has been updated
      dataUpdated = true;
      
      // Set flag if server indicates uploaded data is being used
      if (message.useUploadedData) {
        console.log('Server indicates uploaded data is being used');
        useUploadedData = true;
        addNotification('Using uploaded data', 'info');
      }
      break;
      
    case 'statistics':
      updateDashboard(message.statistics);
      break;
      
    case 'filtered':
      updateCharts(message.data);
      updateDashboard(message.statistics);
      
      // Update historicalData for AI Analysis and Comparison
      historicalData = message.data;
      
      // Set flag that data has been updated
      dataUpdated = true;
      break;
      
    case 'export':
      handleExport(message);
      break;
      
    case 'ai_analysis':
      displayAIResults(message);
      break;
      
    case 'comparison':
      displayComparisonResults(message);
      break;
  }
}

// ============================================================
// DASHBOARD UPDATES
// ============================================================

/**
 * Update dashboard statistics
 * @param {Object} statistics - Statistics data from server
 */
function updateDashboard(statistics) {
  console.log('updateDashboard called with:', statistics);
  
  // Use dynamic stat cards if columnMapping is available
  if (window.columnMapping) {
    updateDynamicStatCards(statistics);
  } else {
    // Fallback to fixed cards for default data
    const totalViewsEl = document.getElementById('totalViews');
    const activeUsersEl = document.getElementById('activeUsers');
    const revenueEl = document.getElementById('revenue');
    const conversionRateEl = document.getElementById('conversionRate');
    
    if (totalViewsEl) {
      totalViewsEl.textContent = formatNumber(statistics.totalViews);
    }
    
    if (activeUsersEl) {
      activeUsersEl.textContent = formatNumber(statistics.activeUsers);
    }
    
    if (revenueEl) {
      revenueEl.textContent = '$' + formatNumber(statistics.totalRevenue);
    }
    
    if (conversionRateEl) {
      conversionRateEl.textContent = statistics.avgConversionRate + '%';
    }
  }
  
  console.log('Dashboard updated with statistics');
}

/**
 * Update dashboard labels with actual column names from uploaded data
 * @param {Array} columnNames - Array of column names from uploaded data
 */
function updateDashboardLabels(columnNames) {
  // Use columnMapping from AI analysis to update labels
  if (window.columnMapping) {
    const mapping = window.columnMapping;
    const formatLabel = (col) => col.charAt(0).toUpperCase() + col.slice(1);
    
    // Update Revenue label
    if (mapping.revenue && mapping.revenue !== 'revenue') {
      const revenueLabel = document.querySelector('#revenue').previousElementSibling?.querySelector('h3');
      if (revenueLabel) {
        revenueLabel.textContent = formatLabel(mapping.revenue);
      }
    }
    
    // Update Users label
    if (mapping.users && mapping.users !== 'users') {
      const usersLabel = document.querySelector('#activeUsers').previousElementSibling?.querySelector('h3');
      if (usersLabel) {
        usersLabel.textContent = formatLabel(mapping.users);
      }
    }
    
    // Update Views label
    if (mapping.views && mapping.views !== 'views') {
      const viewsLabel = document.querySelector('#totalViews').previousElementSibling?.querySelector('h3');
      if (viewsLabel) {
        viewsLabel.textContent = formatLabel(mapping.views);
      }
    }
    
    console.log('Updated dashboard labels using AI columnMapping:', mapping);
  }
}

/**
 * Update chart labels using columnMapping and chartConfig for dynamic column names
 */
function updateChartLabelsWithMapping() {
  if (!window.columnMapping) return;
  
  const mapping = window.columnMapping;
  const chartConfig = window.chartConfig || {
    lineChart: ['metric0', 'metric1'],
    barChart: ['metric0', 'metric2'],
    pieChart: ['metric0', 'metric1', 'metric2', 'metric3']
  };
  
  const formatLabel = (metric) => {
    const columnName = mapping[metric];
    return columnName ? columnName.charAt(0).toUpperCase() + columnName.slice(1) : metric.charAt(0).toUpperCase() + metric.slice(1);
  };
  
  // Update line chart labels
  if (charts.line) {
    chartConfig.lineChart.forEach((metric, index) => {
      if (charts.line.data.datasets[index]) {
        charts.line.data.datasets[index].label = formatLabel(metric);
      }
    });
  }
  
  // Update main line chart labels
  if (charts.mainLine) {
    chartConfig.lineChart.forEach((metric, index) => {
      if (charts.mainLine.data.datasets[index]) {
        charts.mainLine.data.datasets[index].label = formatLabel(metric);
      }
    });
  }
  
  // Update main bar chart labels
  if (charts.mainBar) {
    chartConfig.barChart.forEach((metric, index) => {
      if (charts.mainBar.data.datasets[index]) {
        charts.mainBar.data.datasets[index].label = formatLabel(metric);
      }
    });
  }
  
  // Update pie chart labels
  if (charts.pie && charts.pie.data.labels) {
    charts.pie.data.labels = chartConfig.pieChart.map(metric => formatLabel(metric));
  }
  
  // Update main pie chart labels
  if (charts.mainPie && charts.mainPie.data.labels) {
    charts.mainPie.data.labels = chartConfig.pieChart.map(metric => formatLabel(metric));
  }
  
  console.log('Updated all chart labels using columnMapping and chartConfig');
}

/**
 * Update performance metrics display
 */
function updatePerformanceMetrics() {
  document.getElementById('dataLatency').textContent = performanceMetrics.latency + 'ms';
  document.getElementById('dataPoints').textContent = performanceMetrics.dataPoints;
  document.getElementById('lastUpdate').textContent = performanceMetrics.lastUpdate || '--';
  document.getElementById('connectionQuality').textContent = performanceMetrics.connectionQuality;
  
  // Update performance chart
  if (charts.performance) {
    const now = new Date().toLocaleTimeString();
    charts.performance.data.labels.push(now);
    charts.performance.data.datasets[0].data.push(performanceMetrics.latency);
    
    // Keep only last 30 data points
    if (charts.performance.data.labels.length > 30) {
      charts.performance.data.labels.shift();
      charts.performance.data.datasets[0].data.shift();
    }
    
    charts.performance.update();
  }
}

/**
 * Format numbers with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (typeof num === 'string') {
    num = parseFloat(num);
  }
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ============================================================
// CHART UPDATES
// ============================================================

/**
 * Update all charts with historical data
 * @param {Array} data - Historical data array
 */
function updateCharts(data) {
  // Prepare data for charts
  const labels = data.map(item => item.date);
  
  // Use dynamic chart configuration if available, otherwise use fallback
  const chartConfig = window.chartConfig || {
    lineChart: ['metric0', 'metric1'],
    barChart: ['metric0', 'metric2'],
    pieChart: ['metric0', 'metric1', 'metric2', 'metric3']
  };
  
  // Update chart labels with actual column names from AI analysis
  if (window.columnMapping) {
    updateChartLabelsWithMapping();
  }

  // Update line chart with dynamic metrics
  if (charts.line) {
    charts.line.data.labels = labels;
    chartConfig.lineChart.forEach((metric, index) => {
      if (charts.line.data.datasets[index]) {
        charts.line.data.datasets[index].data = data.map(item => item[metric] || 0);
      }
    });
    charts.line.update();
  }

  // Update main line chart with dynamic metrics
  if (charts.mainLine) {
    charts.mainLine.data.labels = labels;
    chartConfig.lineChart.forEach((metric, index) => {
      if (charts.mainLine.data.datasets[index]) {
        charts.mainLine.data.datasets[index].data = data.map(item => item[metric] || 0);
      }
    });
    charts.mainLine.update();
  }

  // Update main bar chart with dynamic metrics
  if (charts.mainBar) {
    charts.mainBar.data.labels = labels.slice(-10); // Show last 10 data points
    chartConfig.barChart.forEach((metric, index) => {
      if (charts.mainBar.data.datasets[index]) {
        charts.mainBar.data.datasets[index].data = data.slice(-10).map(item => item[metric] || 0);
      }
    });
    charts.mainBar.update();
  }

  // Update pie chart with dynamic metrics
  if (charts.pie) {
    const pieData = chartConfig.pieChart.map(metric => 
      data.reduce((sum, item) => sum + (parseFloat(item[metric]) || 0), 0)
    );
    charts.pie.data.datasets[0].data = pieData;
    charts.pie.update();
  }

  if (charts.mainPie) {
    const pieData = chartConfig.pieChart.map(metric => 
      data.reduce((sum, item) => sum + (parseFloat(item[metric]) || 0), 0)
    );
    charts.mainPie.data.datasets[0].data = pieData;
    charts.mainPie.update();
  }
}

/**
 * Aggregate data by category
 * @param {Array} data - Data array to aggregate
 * @returns {Object} Aggregated data
 */
function aggregateData(data) {
  return {
    sales: data.reduce((sum, item) => sum + (item.sales || 0), 0),
    traffic: data.reduce((sum, item) => sum + (item.traffic || 0), 0),
    users: data.reduce((sum, item) => sum + (item.users || 0), 0),
    revenue: data.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0)
  };
}

// ============================================================
// NAVIGATION
// ============================================================

/**
 * Handle sidebar navigation
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const sectionTitle = document.getElementById('sectionTitle');

  navItems.forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active class from all items
      navItems.forEach(nav => nav.classList.remove('active'));
      
      // Add active class to clicked item
      item.classList.add('active');
      
      // Hide all sections
      sections.forEach(section => section.classList.remove('active'));
      
      // Show selected section
      const sectionId = item.dataset.section;
      document.getElementById(sectionId).classList.add('active');
      
      // Update title
      sectionTitle.textContent = item.querySelector('span:last-child').textContent;
      
      // Update current section
      currentSection = sectionId;
      
      // Auto-run AI analysis when navigating to AI Analysis section
      if (sectionId === 'ai-analysis') {
        console.log('Navigated to AI Analysis, dataUpdated:', dataUpdated);
        runAIAnalysis();
        dataUpdated = false;
      }
      
      // Auto-run comparison when navigating to Comparison section if data was updated
      if (sectionId === 'comparison' && dataUpdated) {
        console.log('Navigated to Comparison, refreshing with new data');
        const period1 = document.getElementById('period1')?.value || 'Last Year';
        const period2 = document.getElementById('period2')?.value || 'Last Month';
        if (period1 !== period2) {
          performComparison(period1, period2);
        }
        dataUpdated = false;
      }
    });
  });
}

// ============================================================
// AI ANALYSIS
// ============================================================

/**
 * Setup AI analysis functionality
 */
function setupAIAnalysis() {
  const runAIButton = document.getElementById('runAIAnalysis');
  
  runAIButton.addEventListener('click', () => {
    runAIAnalysis();
  });
}

/**
 * Run AI analysis on current data
 */
function runAIAnalysis() {
  console.log('runAIAnalysis called');
  
  const predictionContent = document.getElementById('predictionContent');
  const insightsContent = document.getElementById('insightsContent');
  const recommendationsContent = document.getElementById('recommendationsContent');
  const trendContent = document.getElementById('trendContent');
  const distributionContent = document.getElementById('distributionContent');
  
  console.log('Content elements found:', {
    predictionContent: !!predictionContent,
    insightsContent: !!insightsContent,
    recommendationsContent: !!recommendationsContent,
    trendContent: !!trendContent,
    distributionContent: !!distributionContent
  });
  
  // Check if data is available
  console.log('historicalData:', historicalData ? historicalData.length : 'null/undefined');
  if (!historicalData || historicalData.length === 0) {
    console.log('No data available for analysis');
    const errorMsg = '<p class="ai-placeholder">No data available. Please wait for data to load or upload data.</p>';
    predictionContent.innerHTML = errorMsg;
    insightsContent.innerHTML = errorMsg;
    recommendationsContent.innerHTML = errorMsg;
    if (trendContent) trendContent.innerHTML = errorMsg;
    if (distributionContent) distributionContent.innerHTML = errorMsg;
    addNotification('No data available for analysis', 'error');
    return;
  }
  
  console.log('Data available, showing loading state');
  // Show loading state
  predictionContent.innerHTML = '<p class="ai-placeholder">Generating predictions...</p>';
  insightsContent.innerHTML = '<p class="ai-placeholder">Discovering insights...</p>';
  recommendationsContent.innerHTML = '<p class="ai-placeholder">Creating recommendations...</p>';
  if (trendContent) trendContent.innerHTML = '<p class="ai-placeholder">Analyzing trends...</p>';
  if (distributionContent) distributionContent.innerHTML = '<p class="ai-placeholder">Calculating distribution...</p>';
  
  // Run AI analysis immediately without delay
  console.log('Starting analysis...');
  try {
    console.log('Generating predictions...');
    const predictions = generatePredictions(historicalData);
    console.log('Predictions generated:', predictions);
    
    console.log('Generating insights...');
    const insights = generateInsights(historicalData);
    console.log('Insights generated:', insights);
    
    console.log('Generating recommendations...');
    const recommendations = generateRecommendations(historicalData);
    console.log('Recommendations generated:', recommendations);
    
    console.log('Generating trend stats...');
    const trendStats = generateTrendStats(historicalData);
    console.log('Trend stats generated:', trendStats);
    
    console.log('Generating distribution stats...');
    const distributionStats = generateDistributionStats(historicalData);
    console.log('Distribution stats generated:', distributionStats);
    
    console.log('Displaying results...');
    displayAIResults({ predictions, insights, recommendations, trendStats, distributionStats });
    
    console.log('AI analysis completed successfully');
    addNotification('AI analysis completed', 'success');
    
    // Initialize charts immediately without delay
    console.log('Initializing charts...');
    try {
      initializeAICharts(historicalData, null, predictions);
      console.log('Charts initialized');
    } catch (error) {
      console.error('Chart initialization error:', error);
      // Don't block the whole analysis if charts fail
    }
  } catch (error) {
    console.error('AI analysis error:', error);
    console.error('Error stack:', error.stack);
    const errorMsg = `<p class="ai-placeholder">Error during analysis: ${error.message}. Please try again.</p>`;
    predictionContent.innerHTML = errorMsg;
    insightsContent.innerHTML = errorMsg;
    recommendationsContent.innerHTML = errorMsg;
    if (trendContent) trendContent.innerHTML = errorMsg;
    if (distributionContent) distributionContent.innerHTML = errorMsg;
    addNotification('Analysis failed: ' + error.message, 'error');
  }
}

/**
 * Detect anomalies in data
 */
function detectAnomalies(data) {
  if (data.length < 10) return { detected: 0, items: [] };
  
  // Determine which column to use for analysis
  const valueKey = data[0].views !== undefined ? 'views' : 
                   data[0].metric0 !== undefined ? 'metric0' : 
                   Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
  
  if (!valueKey) return { detected: 0, items: [] };
  
  const values = data.map(d => d[valueKey]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
  
  const anomalies = data.filter(d => Math.abs(d[valueKey] - mean) > 2 * stdDev);
  
  return {
    detected: anomalies.length,
    items: anomalies.slice(0, 5).map(a => ({
      date: a.date,
      value: a[valueKey],
      deviation: ((a[valueKey] - mean) / mean * 100).toFixed(1) + '%'
    }))
  };
}

/**
 * Generate predictions based on historical data
 */
function generatePredictions(data) {
  if (data.length < 5) return { nextPeriod: 'N/A', trend: 'Insufficient data' };
  
  // Determine which column to use for analysis
  const valueKey = data[0].views !== undefined ? 'views' : 
                   data[0].metric0 !== undefined ? 'metric0' : 
                   Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
  
  if (!valueKey) return { nextPeriod: 'N/A', trend: 'Insufficient data' };
  
  const recent = data.slice(-7);
  const avgViews = recent.reduce((sum, d) => sum + d[valueKey], 0) / recent.length;
  const trend = recent[recent.length - 1][valueKey] > recent[0][valueKey] ? 'Increasing' : 'Decreasing';
  
  return {
    nextPeriod: Math.round(avgViews * 1.1).toLocaleString(),
    trend: trend,
    confidence: '85%',
    timeframe: 'Next 7 days'
  };
}

/**
 * Generate insights from data
 */
function generateInsights(data) {
  const insights = [];
  
  if (data.length > 0) {
    // Determine which column to use for analysis
    const valueKey = data[0].views !== undefined ? 'views' : 
                     data[0].metric0 !== undefined ? 'metric0' : 
                     Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
    
    if (!valueKey) return ['No numeric data available for insights'];
    
    const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]);
    const peak = sorted[0];
    const avg = data.reduce((sum, d) => sum + d[valueKey], 0) / data.length;
    
    insights.push(`Peak value was ${peak[valueKey].toLocaleString()} on ${peak.date}`);
    insights.push(`Average daily value is ${Math.round(avg).toLocaleString()}`);
    
    if (data.length > 7) {
      const weekAgo = data[data.length - 8][valueKey];
      const today = data[data.length - 1][valueKey];
      const change = ((today - weekAgo) / weekAgo * 100).toFixed(1);
      insights.push(`Weekly change: ${change > 0 ? '+' : ''}${change}%`);
    }
  }
  
  return insights;
}

/**
 * Generate recommendations
 */
function generateRecommendations(data) {
  const recommendations = [];
  
  if (data.length > 0) {
    // Determine which column to use for analysis
    const valueKey = data[0].views !== undefined ? 'views' : 
                     data[0].metric0 !== undefined ? 'metric0' : 
                     Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
    
    if (!valueKey) return ['No data available for recommendations'];
    
    const recent = data.slice(-7);
    const avgValue = recent.reduce((sum, d) => sum + d[valueKey], 0) / recent.length;
    
    if (avgValue < 5000) {
      recommendations.push('Consider increasing marketing efforts to boost performance');
    }
    
    const weekendData = recent.filter(d => {
      const day = new Date(d.date).getDay();
      return day === 0 || day === 6;
    });
    
    if (weekendData.length > 0) {
      const weekendAvg = weekendData.reduce((sum, d) => sum + d[valueKey], 0) / weekendData.length;
      if (weekendAvg < avgValue * 0.7) {
        recommendations.push('Weekend performance is lower - consider weekend promotions');
      }
    }
    
    recommendations.push('Monitor conversion rate for optimization opportunities');
    recommendations.push('Review user engagement metrics for content improvements');
  }
  
  return recommendations;
}

/**
 * Generate trend analysis stats
 */
function generateTrendStats(data) {
  const valueKey = data[0].views !== undefined ? 'views' : 
                   data[0].metric0 !== undefined ? 'metric0' : 
                   Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
  
  if (!valueKey) return { weeklyAverages: [], trend: 'No data' };
  
  const weeklyData = [];
  for (let i = 0; i < data.length; i += 7) {
    const week = data.slice(i, i + 7);
    if (week.length > 0) {
      weeklyData.push({
        date: week[0].date,
        avg: week.reduce((sum, d) => sum + d[valueKey], 0) / week.length
      });
    }
  }
  
  const trend = weeklyData.length >= 2 && 
    weeklyData[weeklyData.length - 1].avg > weeklyData[0].avg ? 'Increasing' : 'Stable/Decreasing';
  
  return {
    weeklyAverages: weeklyData,
    trend: trend,
    totalWeeks: weeklyData.length,
    peakWeek: weeklyData.length > 0 ? weeklyData.reduce((max, w) => w.avg > max.avg ? w : max, weeklyData[0]) : null
  };
}

/**
 * Generate distribution stats
 */
function generateDistributionStats(data) {
  const numericColumns = Object.keys(data[0]).filter(key => 
    typeof data[0][key] === 'number' && key !== 'timestamp'
  );
  
  if (numericColumns.length === 0) return { distributions: [], dominant: 'No data' };
  
  const distributions = numericColumns.map(col => {
    const total = data.reduce((sum, d) => sum + (parseFloat(d[col]) || 0), 0);
    return {
      column: col,
      total: total,
      percentage: 0 // Will be calculated after
    };
  });
  
  const grandTotal = distributions.reduce((sum, d) => sum + d.total, 0);
  distributions.forEach(d => {
    d.percentage = grandTotal > 0 ? (d.total / grandTotal * 100).toFixed(1) : '0';
  });
  
  const dominant = distributions.length > 0 ? 
    distributions.reduce((max, d) => d.total > max.total ? d : max, distributions[0]).column : 'No data';
  
  return {
    distributions: distributions,
    dominant: dominant,
    totalMetrics: distributions.length
  };
}

/**
 * Initialize AI analysis charts
 */
function initializeAICharts(data, anomalies, predictions) {
  console.log('Initializing AI charts with data length:', data.length);
  const colors = getChartColors();
  
  // Determine which column to use for analysis
  const valueKey = data[0].views !== undefined ? 'views' : 
                   data[0].metric0 !== undefined ? 'metric0' : 
                   Object.keys(data[0]).find(key => typeof data[0][key] === 'number' && key !== 'timestamp');
  
  console.log('Using value key:', valueKey);
  
  if (!valueKey) {
    console.error('No valid numeric column found in data');
    return;
  }
  
  try {
    // Prediction Chart
    const predictionCtx = document.getElementById('predictionChart');
    console.log('Prediction chart canvas found:', !!predictionCtx);
    
    if (predictionCtx) {
      const recentData = data.slice(-14);
      const labels = recentData.map(d => d.date);
      const actualValues = recentData.map(d => d[valueKey]);
      
      // Generate predicted values
      const predictedValues = [...actualValues];
      const lastValue = actualValues[actualValues.length - 1];
      const trend = predictions && predictions.trend === 'Increasing' ? 1.1 : 0.9;
    
    // Add 7 days of predictions
    for (let i = 0; i < 7; i++) {
      const predictedValue = Math.round(lastValue * Math.pow(trend, i + 1));
      predictedValues.push(predictedValue);
      const lastDate = new Date(recentData[recentData.length - 1].date);
      lastDate.setDate(lastDate.getDate() + i + 1);
      labels.push(lastDate.toISOString().split('T')[0]);
    }
    
    if (charts.prediction) {
      charts.prediction.destroy();
    }
    
    charts.prediction = new Chart(predictionCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Actual',
          data: actualValues.concat(new Array(7).fill(null)),
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}20`,
          fill: false,
          tension: 0.4
        }, {
          label: 'Predicted',
          data: predictedValues,
          borderColor: colors.secondary,
          backgroundColor: `${colors.secondary}20`,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: colors.text }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          },
          y: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          }
        }
      }
    });
    console.log('Prediction chart created successfully');
  }
  
  // Trend Analysis Chart
  const trendCtx = document.getElementById('trendChart');
  console.log('Trend chart canvas found:', !!trendCtx);
  
  if (trendCtx) {
    const weeklyData = [];
    for (let i = 0; i < data.length; i += 7) {
      const week = data.slice(i, i + 7);
      if (week.length > 0) {
        weeklyData.push({
          date: week[0].date,
          avg: week.reduce((sum, d) => sum + d[valueKey], 0) / week.length
        });
      }
    }
    
    if (charts.trend) {
      charts.trend.destroy();
    }
    
    charts.trend = new Chart(trendCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: weeklyData.map(d => d.date),
        datasets: [{
          label: 'Weekly Average',
          data: weeklyData.map(d => d.avg),
          backgroundColor: weeklyData.map((d, i) => 
            i === weeklyData.length - 1 ? colors.success : colors.primary
          )
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: colors.text }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          },
          y: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          }
        }
      }
    });
    console.log('Trend chart created successfully');
  }
  
  // Distribution Chart
  const distributionCtx = document.getElementById('distributionChart');
  console.log('Distribution chart canvas found:', !!distributionCtx);
  
  if (distributionCtx) {
    // Get all numeric columns for distribution
    const numericColumns = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number' && key !== 'timestamp'
    );
    
    const categories = numericColumns.length > 0 ? numericColumns : ['metric0', 'metric1', 'metric2', 'metric3'];
    const distributionData = categories.map(cat => 
      data.reduce((sum, d) => sum + (parseFloat(d[cat]) || 0), 0)
    );
    
    if (charts.distribution) {
      charts.distribution.destroy();
    }
    
    charts.distribution = new Chart(distributionCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
        datasets: [{
          data: distributionData,
          backgroundColor: [
            colors.primary,
            colors.secondary,
            colors.success,
            colors.warning
          ],
          borderWidth: 2,
          borderColor: getChartColors().grid
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: colors.text }
          }
        }
      }
    });
    console.log('Distribution chart created successfully');
  }
  
  console.log('All AI charts initialized successfully');
  } catch (error) {
    console.error('Error initializing AI charts:', error);
    addNotification('Error creating charts', 'error');
  }
}

/**
 * Display AI analysis results
 */
function displayAIResults(results) {
  const predictionContent = document.getElementById('predictionContent');
  const insightsContent = document.getElementById('insightsContent');
  const recommendationsContent = document.getElementById('recommendationsContent');
  const trendContent = document.getElementById('trendContent');
  const distributionContent = document.getElementById('distributionContent');
  
  // Predictions
  if (predictionContent) {
    if (results.predictions) {
      predictionContent.innerHTML = `
        <div class="ai-result">
          <div class="ai-result-item">
            <div class="ai-result-label">Predicted Value</div>
            <div class="ai-result-value">${results.predictions.nextPeriod}</div>
          </div>
          <div class="ai-result-item">
            <div class="ai-result-label">Trend</div>
            <div class="ai-result-value">${results.predictions.trend}</div>
          </div>
          <div class="ai-result-item">
            <div class="ai-result-label">Confidence</div>
            <div class="ai-result-value">${results.predictions.confidence}</div>
          </div>
          <div class="ai-result-item">
            <div class="ai-result-label">Timeframe</div>
            <div class="ai-result-value">${results.predictions.timeframe}</div>
          </div>
        </div>
      `;
    } else {
      predictionContent.innerHTML = '<div class="ai-result"><p>No predictions available</p></div>';
    }
  }
  
  // Trend Analysis
  if (trendContent && results.trendStats) {
    if (results.trendStats.weeklyAverages && results.trendStats.weeklyAverages.length > 0) {
      trendContent.innerHTML = `
        <div class="ai-result">
          <div class="ai-result-item">
            <div class="ai-result-label">Overall Trend</div>
            <div class="ai-result-value">${results.trendStats.trend}</div>
          </div>
          <div class="ai-result-item">
            <div class="ai-result-label">Total Weeks Analyzed</div>
            <div class="ai-result-value">${results.trendStats.totalWeeks}</div>
          </div>
          ${results.trendStats.peakWeek ? `
          <div class="ai-result-item">
            <div class="ai-result-label">Peak Week</div>
            <div class="ai-result-value">${results.trendStats.peakWeek.date} (${Math.round(results.trendStats.peakWeek.avg).toLocaleString()})</div>
          </div>
          ` : ''}
        </div>
      `;
    } else {
      trendContent.innerHTML = '<div class="ai-result"><p>No trend data available</p></div>';
    }
  }
  
  // Distribution
  if (distributionContent && results.distributionStats) {
    if (results.distributionStats.distributions && results.distributionStats.distributions.length > 0) {
      distributionContent.innerHTML = `
        <div class="ai-result">
          <div class="ai-result-item">
            <div class="ai-result-label">Dominant Metric</div>
            <div class="ai-result-value">${results.distributionStats.dominant}</div>
          </div>
          <div class="ai-result-item">
            <div class="ai-result-label">Total Metrics</div>
            <div class="ai-result-value">${results.distributionStats.totalMetrics}</div>
          </div>
          ${results.distributionStats.distributions.slice(0, 3).map(d => `
            <div class="ai-result-item">
              <div class="ai-result-label">${d.column}</div>
              <div class="ai-result-value">${d.percentage}%</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      distributionContent.innerHTML = '<div class="ai-result"><p>No distribution data available</p></div>';
    }
  }
  
  // Insights
  if (insightsContent) {
    if (results.insights && results.insights.length > 0) {
      insightsContent.innerHTML = `
        <div class="ai-result">
          ${results.insights.map(insight => `
            <div class="ai-result-item">
              <div class="ai-result-value">• ${insight}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      insightsContent.innerHTML = '<div class="ai-result"><p>No insights available</p></div>';
    }
  }
  
  // Recommendations
  if (recommendationsContent) {
    if (results.recommendations && results.recommendations.length > 0) {
      recommendationsContent.innerHTML = `
        <div class="ai-result">
          ${results.recommendations.map(rec => `
            <div class="ai-result-item">
              <div class="ai-result-value">• ${rec}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      recommendationsContent.innerHTML = '<div class="ai-result"><p>No recommendations available</p></div>';
    }
  }
  
  console.log('AI results displayed successfully');
}

// ============================================================
// COMPARISON FEATURE
// ============================================================

/**
 * Setup comparison functionality
 */
function setupComparison() {
  const compareBtn = document.getElementById('compareBtn');
  
  compareBtn.addEventListener('click', () => {
    const period1 = document.getElementById('period1').value;
    const period2 = document.getElementById('period2').value;
    
    if (period1 === period2) {
      addNotification('Please select different periods to compare', 'error');
      return;
    }
    
    performComparison(period1, period2);
  });
}

/**
 * Perform data comparison
 */
function performComparison(period1, period2) {
  const resultsDiv = document.getElementById('comparisonResults');
  resultsDiv.innerHTML = '<p class="ai-placeholder">Comparing data...</p>';
  
  // Check if data is available
  if (!historicalData || historicalData.length === 0) {
    resultsDiv.innerHTML = '<p class="ai-placeholder">No data available for comparison</p>';
    addNotification('No data available', 'error');
    return;
  }
  
  // Simulate comparison (in real app, this would fetch specific period data)
  setTimeout(() => {
    const data1 = historicalData.slice(-7);
    const data2 = historicalData.slice(-14, -7);
    
    const stats1 = calculatePeriodStats(data1);
    const stats2 = calculatePeriodStats(data2);
    
    // Build comparison object dynamically based on available columns
    const numericColumns = Object.keys(stats1).filter(key => typeof stats1[key] === 'number');
    
    const comparison = {};
    numericColumns.forEach(col => {
      const val1 = stats1[col] || 0;
      const val2 = stats2[col] || 0;
      const change = val2 !== 0 ? ((val1 - val2) / val2 * 100).toFixed(1) : '0';
      
      comparison[col] = {
        period1: val1,
        period2: val2,
        change: change
      };
    });
    
    displayComparisonResults(comparison);
    addNotification('Comparison completed', 'success');
  }, 1000);
}

/**
 * Calculate statistics for a period
 */
function calculatePeriodStats(data) {
  // Determine which columns to use for analysis
  const numericColumns = Object.keys(data[0]).filter(key => 
    typeof data[0][key] === 'number' && key !== 'timestamp'
  );
  
  const stats = {};
  numericColumns.forEach((col, index) => {
    const total = data.reduce((sum, d) => sum + (parseFloat(d[col]) || 0), 0);
    stats[col] = total;
  });
  
  // Add fallback for default columns if they exist
  if (data[0].views !== undefined) {
    stats.views = data.reduce((sum, d) => sum + d.views, 0);
  }
  if (data[0].users !== undefined) {
    stats.users = data.reduce((sum, d) => sum + d.users, 0);
  }
  if (data[0].revenue !== undefined) {
    stats.revenue = data.reduce((sum, d) => sum + parseFloat(d.revenue), 0);
  }
  
  return stats;
}

/**
 * Display comparison results
 */
function displayComparisonResults(comparison) {
  const resultsDiv = document.getElementById('comparisonResults');
  
  // Build comparison items dynamically
  const comparisonItems = Object.entries(comparison).map(([col, data]) => {
    const displayName = col.charAt(0).toUpperCase() + col.slice(1);
    const changeNum = parseFloat(data.change);
    const changeClass = changeNum >= 0 ? 'positive' : 'negative';
    const changeIcon = changeNum >= 0 ? '↑' : '↓';
    const difference = data.period1 - data.period2;
    
    return `
      <div class="comparison-item">
        <h4>${displayName}</h4>
        <div class="value">${data.period1.toLocaleString()}</div>
        <div class="change ${changeClass}">
          ${changeIcon} ${changeNum >= 0 ? '+' : ''}${data.change}%
        </div>
        <div class="period-info">
          <span class="period-label">Previous:</span>
          <span class="period-value">${data.period2.toLocaleString()}</span>
        </div>
        <div class="difference-info">
          <span class="difference-label">Difference:</span>
          <span class="difference-value ${changeClass}">${difference >= 0 ? '+' : ''}${difference.toLocaleString()}</span>
        </div>
        <div class="trend-indicator">
          ${changeNum >= 10 ? '<span class="trend-strong">Strong Growth</span>' : 
            changeNum >= 0 ? '<span class="trend-moderate">Moderate Growth</span>' : 
            changeNum <= -10 ? '<span class="trend-decline">Significant Decline</span>' : 
            '<span class="trend-slight">Slight Decline</span>'}
        </div>
      </div>
    `;
  }).join('');
  
  // Add summary section
  const totalMetrics = Object.keys(comparison).length;
  const increasingMetrics = Object.values(comparison).filter(d => parseFloat(d.change) >= 0).length;
  const decreasingMetrics = totalMetrics - increasingMetrics;
  
  const summaryHTML = `
    <div class="comparison-summary">
      <div class="summary-item">
        <span class="summary-label">Total Metrics</span>
        <span class="summary-value">${totalMetrics}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Increasing</span>
        <span class="summary-value positive">${increasingMetrics}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Decreasing</span>
        <span class="summary-value negative">${decreasingMetrics}</span>
      </div>
    </div>
  `;
  
  resultsDiv.innerHTML = `
    ${summaryHTML}
    <div class="comparison-data">
      ${comparisonItems}
    </div>
  `;
}

// ============================================================
// FILE UPLOAD FOR DATA SOURCE
// ============================================================

/**
 * Setup file upload functionality for CSV/Excel files
 */
function setupFileUpload() {
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const fileName = document.getElementById('fileName');
  const fetchFileBtn = document.getElementById('fetchFileBtn');
  let selectedFile = null;

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedFile = file;
        fileName.textContent = file.name;
        // Show the Load Data button
        if (fetchFileBtn) {
          fetchFileBtn.style.display = 'flex';
        }
      }
    });
  }

  // Load Data button click handler
  if (fetchFileBtn) {
    fetchFileBtn.addEventListener('click', async () => {
      if (selectedFile) {
        addNotification('Processing file...', 'info');
        try {
          await processUploadedFile(selectedFile);
          addNotification('Data loaded successfully! Charts updated.', 'success');
        } catch (error) {
          addNotification('Error processing file: ' + error.message, 'error');
        }
      }
    });
  }

  // Setup tab switching
  setupUploadTabs();

  // Setup URL fetch
  setupUrlFetch();
}

/**
 * Setup upload tab switching
 */
function setupUploadTabs() {
  const tabs = document.querySelectorAll('.upload-tab');
  const tabContents = document.querySelectorAll('.upload-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

/**
 * Process data fetched from URL
 */
async function processUrlData(data) {
  if (!data || data.length === 0) {
    addNotification('No data found in URL', 'error');
    return;
  }

  // Transform data to match expected format
  const transformedData = transformDataForCharts(data);
  console.log('Transformed data sample:', transformedData[0]);
  
  // Set flag to stop real-time updates
  useUploadedData = true;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'upload_data',
      data: transformedData,
      columnMapping: window.columnMapping
    }));
  }
  
  addNotification('Data loaded successfully! Charts updated.', 'success');
}

/**
 * Setup URL fetch functionality
 */
function setupUrlFetch() {
  const fetchUrlBtn = document.getElementById('fetchUrlBtn');
  const urlInput = document.getElementById('urlInput');

  if (fetchUrlBtn && urlInput) {
    fetchUrlBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        addNotification('Please enter a URL', 'error');
        return;
      }

      try {
        addNotification('Fetching data from URL...', 'info');
        
        // Handle Google Sheets URLs
        let fetchUrl = url;
        if (url.includes('docs.google.com/spreadsheets')) {
          // Extract spreadsheet ID from Google Sheets URL
          const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match) {
            const spreadsheetId = match[1];
            // Convert to CSV export URL
            fetchUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
            console.log('Converted Google Sheets URL to CSV export:', fetchUrl);
            addNotification('Converting Google Sheets to CSV format...', 'info');
            
            // Google Sheets often has CORS issues, try with no-cors mode as fallback
            try {
              const response = await fetch(fetchUrl, {
                mode: 'cors',
                credentials: 'omit'
              });
              
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              
              const text = await response.text();
              console.log('Fetched text length:', text.length);
              console.log('First 200 characters:', text.substring(0, 200));
              const data = parseCSVText(text);
              
              if (data && data.length > 0) {
                console.log('Successfully parsed data from Google Sheets, rows:', data.length);
                console.log('Sample data:', data[0]);
                await processUrlData(data);
                return;
              }
            } catch (corsError) {
              console.error('CORS error with Google Sheets:', corsError);
              addNotification('Google Sheets has CORS restrictions. Please export to CSV and upload the file instead.', 'warning');
              addNotification('To export: File → Download → Comma-separated values (.csv)', 'info');
              return;
            }
          }
        }

        const response = await fetch(fetchUrl, {
          mode: 'cors',
          credentials: 'omit'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          console.log('Fetched text length:', text.length);
          console.log('First 200 characters:', text.substring(0, 200));
          data = parseCSVText(text);
        }

        if (data && data.length > 0) {
          console.log('Successfully parsed data from URL, rows:', data.length);
          console.log('Sample data:', data[0]);
          await processUrlData(data);
        } else {
          throw new Error('No data found in the response');
        }
      } catch (error) {
        console.error('Error fetching data from URL:', error);
        addNotification('Error fetching data: ' + error.message, 'error');
      }
    });
  }
}

/**
 * Parse CSV text (helper for URL fetch)
 */
function parseCSVText(text) {
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const obj = {};
      
      headers.forEach((header, index) => {
        const value = values[index] ? values[index].trim() : '';
        const numValue = parseFloat(value);
        obj[header] = isNaN(numValue) ? value : numValue;
      });
      
      data.push(obj);
    }
  }
  
  return data;
}

/**
 * Process uploaded file (CSV or Excel)
 */
async function processUploadedFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  console.log('Processing file:', file.name, 'Extension:', extension);
  
  // Stop real-time updates immediately when user tries to upload
  useUploadedData = true;
  console.log('Stopped real-time updates (user attempting upload)');
  
  try {
    let data;
    
    if (extension === 'csv') {
      console.log('Parsing as CSV');
      data = await parseCSV(file);
    } else if (extension === 'xlsx' || extension === 'xls') {
      console.log('Parsing as Excel');
      data = await parseExcel(file);
    } else {
      addNotification('Unsupported file format. Please use CSV or Excel (.xlsx, .xls)', 'error');
      useUploadedData = false; // Resume real-time if format is wrong
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Original data sample:', data[0]);
      console.log('Total rows:', data.length);
      
      // Use AI to analyze columns and suggest intelligent mappings
      let aiMapping = null;
      try {
        console.log('Analyzing columns with AI...');
        addNotification('AI analyzing your data...', 'info');
        aiMapping = await analyzeColumnsWithAI(Object.keys(data[0]), data[0]);
        if (aiMapping) {
          console.log('AI suggested mapping:', aiMapping);
          addNotification('AI analysis complete!', 'success');
        }
      } catch (error) {
        console.log('AI analysis failed, using auto-detection:', error);
        addNotification('AI analysis unavailable, using auto-detection', 'warning');
      }
      
      // Transform data to match expected format
      const transformedData = transformDataForCharts(data, aiMapping);
      console.log('Transformed data sample:', transformedData[0]);
      
      // Generate dynamic stat cards based on the column mapping (either AI or fallback)
      if (window.columnMapping) {
        generateDynamicStatCards(window.columnMapping);
      }
      
      // Calculate statistics from transformed data
      const stats = calculateStatistics(transformedData);
      console.log('Calculated statistics from uploaded data:', stats);
      
      // Send data to backend via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Sending data to backend via WebSocket');
        ws.send(JSON.stringify({
          type: 'upload_data',
          data: transformedData,
          columnMapping: window.columnMapping
        }));
        addNotification('Data uploaded successfully', 'success');
      } else {
        console.log('WebSocket not connected, using data locally');
        // Use the data locally if WebSocket is not connected
        historicalData = transformedData;
        updateCharts(transformedData);
        updateDashboard(stats);
        addNotification('Data loaded locally (offline mode)', 'warning');
        
        // Set flag that data has been updated
        dataUpdated = true;
      }
    } else {
      addNotification('No data found in file', 'error');
      useUploadedData = false; // Resume real-time if no data found
    }
  } catch (error) {
    console.error('Error processing file:', error);
    console.error('Error message:', error.message);
    addNotification('Error processing file: ' + error.message, 'error');
    useUploadedData = false; // Resume real-time if upload fails
  }
}

/**
 * Transform uploaded data to match expected chart format
 * Preserves original column names for dynamic display
 * @param {Array} data - Raw data from Excel file
 * @param {Object} aiMapping - AI-suggested column mapping for all columns
 */
function transformDataForCharts(data, aiMapping = null) {
  console.log('Available columns in first row:', Object.keys(data[0]));
  
  // Store column names for reference
  const columnNames = Object.keys(data[0]);
  
  // Use AI mapping if provided, otherwise detect numeric columns as fallback
  let columnMapping;
  
  if (aiMapping) {
    console.log('Using AI-suggested column mapping:', aiMapping);
    columnMapping = aiMapping;
  } else {
    // Fallback: detect numeric columns and create dynamic mapping
    const numericColumns = columnNames.filter(col => {
      const value = data[0][col];
      return !isNaN(parseFloat(value)) && isFinite(value);
    });
    
    console.log('Detected numeric columns:', numericColumns);
    
    // Create dynamic mapping for all numeric columns
    columnMapping = {};
    numericColumns.forEach((col, index) => {
      columnMapping[`metric${index}`] = col;
    });
    
    console.log('Auto-detected column mapping:', columnMapping);
  }
  
  window.columnMapping = columnMapping;
  
  return data.map(item => {
    // Use AI mapping to extract values dynamically
    const transformed = {
      date: item.date || item.Date || item.DATE || new Date().toISOString().split('T')[0]
    };
    
    // Add all metrics from the mapping
    Object.entries(columnMapping).forEach(([metric, columnName]) => {
      transformed[metric] = item[columnName] !== undefined ? parseFloat(item[columnName]) || 0 : 0;
    });
    
    // Preserve original column names for display
    transformed.originalColumns = {};
    columnNames.forEach(col => {
      transformed.originalColumns[col] = item[col];
    });
    
    // Add timestamp if not present
    if (!item.timestamp) {
      transformed.timestamp = new Date(transformed.date).getTime();
    } else {
      transformed.timestamp = item.timestamp;
    }
    
    return transformed;
  });
}

/**
 * Parse CSV file
 */
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      const data = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',');
          const obj = {};
          
          headers.forEach((header, index) => {
            const value = values[index] ? values[index].trim() : '';
            // Try to convert to number if possible
            const numValue = parseFloat(value);
            obj[header] = isNaN(numValue) ? value : numValue;
          });
          
          data.push(obj);
        }
      }
      
      resolve(data);
    };
    
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Parse Excel file using xlsx library
 */
async function parseExcel(file) {
  console.log('Starting Excel file parsing for:', file.name);
  
  // Load xlsx from npm package
  let XLSX;
  try {
    XLSX = require('xlsx');
    console.log('XLSX library loaded from npm package');
    console.log('XLSX version:', XLSX.version);
  } catch (error) {
    console.error('Failed to load xlsx from npm:', error);
    throw new Error('XLSX library not available. Please run: npm install xlsx');
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        console.log('File read successfully, size:', e.target.result.byteLength, 'bytes');
        const data = new Uint8Array(e.target.result);
        console.log('Reading Excel workbook...');
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('Workbook read, sheets:', workbook.SheetNames);
        
        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        console.log('Processing sheet:', firstSheetName);
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        console.log('Converted to JSON, rows:', jsonData.length);
        
        if (jsonData.length === 0) {
          throw new Error('Excel file is empty or could not be parsed');
        }
        
        console.log('First row data:', jsonData[0]);
        
        // Convert data to match our format
        const formattedData = jsonData.map(row => {
          const obj = {};
          Object.keys(row).forEach(key => {
            const value = row[key];
            const numValue = parseFloat(value);
            obj[key.trim()] = isNaN(numValue) ? value : numValue;
          });
          return obj;
        });
        
        console.log('Formatted data sample:', formattedData[0]);
        resolve(formattedData);
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(new Error('Failed to read file: ' + error));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Calculate statistics from transformed data
 * @param {Array} data - Transformed data array
 * @returns {Object} Calculated statistics for all dynamic metrics
 */
function calculateStatistics(data) {
  if (data.length === 0) {
    return {};
  }
  
  const statistics = {};
  
  // Get all metric keys from the first data item (excluding date, timestamp, originalColumns)
  const metricKeys = Object.keys(data[0]).filter(key => 
    key !== 'date' && key !== 'timestamp' && key !== 'originalColumns'
  );
  
  // Calculate sum for each metric
  metricKeys.forEach(metric => {
    const total = data.reduce((sum, item) => sum + (parseFloat(item[metric]) || 0), 0);
    statistics[metric] = total;
  });
  
  return statistics;
}

// ============================================================
// WINDOW CONTROLS
// ============================================================

/**
 * Setup window control buttons (macOS-style)
 */
function setupWindowControls() {
  const closeBtn = document.getElementById('windowClose');
  const minimizeBtn = document.getElementById('windowMinimize');
  const maximizeBtn = document.getElementById('windowMaximize');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-close');
      }
    });
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-minimize');
      }
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-maximize');
      }
    });
  }
}

// ============================================================
// THEME TOGGLE
// ============================================================

/**
 * Setup theme toggle functionality
 */
function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  
  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    updateChartColors();
    addNotification(`Switched to ${newTheme} theme`, 'success');
  });
}

/**
 * Update theme icon
 */
function updateThemeIcon(theme) {
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'moon' : 'sun');
    lucide.createIcons();
  }
}

/**
 * Update chart colors when theme changes
 */
function updateChartColors() {
  const colors = getChartColors();
  
  Object.values(charts).forEach(chart => {
    if (chart.options.scales) {
      chart.options.scales.x.ticks.color = colors.text;
      chart.options.scales.x.grid.color = colors.grid;
      chart.options.scales.y.ticks.color = colors.text;
      chart.options.scales.y.grid.color = colors.grid;
    }
    if (chart.options.plugins && chart.options.plugins.legend) {
      chart.options.plugins.legend.labels.color = colors.text;
    }
    chart.update();
  });
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    switch (e.key.toLowerCase()) {
      case 'r':
        e.preventDefault();
        refreshData();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 't':
        e.preventDefault();
        document.getElementById('themeToggle').click();
        break;
      case 'n':
        e.preventDefault();
        toggleNotifications();
        break;
      case '?':
        e.preventDefault();
        toggleShortcutsModal();
        break;
      case 'escape':
        closeModal();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
        e.preventDefault();
        navigateToSection(parseInt(e.key) - 1);
        break;
    }
  });
  
  // Help button
  document.getElementById('helpBtn').addEventListener('click', toggleShortcutsModal);
  
  // Close shortcuts modal
  document.getElementById('closeShortcuts').addEventListener('click', closeModal);
  
  // Notification bell
  document.getElementById('notificationBell').addEventListener('click', toggleNotifications);
  document.getElementById('closeNotifications').addEventListener('click', toggleNotifications);
}

/**
 * Refresh data
 */
function refreshData() {
  const refreshBtn = document.getElementById('refreshBtn');
  const originalIcon = refreshBtn.innerHTML;
  
  // Show loading state
  if (refreshBtn) {
    refreshBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
    refreshBtn.disabled = true;
    lucide.createIcons();
  }
  
  addNotification('Refreshing data...', 'info');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'refresh' }));
    
    // Reset button after 2 seconds
    setTimeout(() => {
      if (refreshBtn) {
        refreshBtn.innerHTML = originalIcon;
        refreshBtn.disabled = false;
        lucide.createIcons();
      }
      addNotification('Data refreshed', 'success');
    }, 2000);
  } else {
    // Reset button if not connected
    setTimeout(() => {
      if (refreshBtn) {
        refreshBtn.innerHTML = originalIcon;
        refreshBtn.disabled = false;
        lucide.createIcons();
      }
      addNotification('Cannot refresh - not connected to server', 'error');
    }, 500);
  }
}

/**
 * Toggle fullscreen
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

/**
 * Toggle notifications panel
 */
function toggleNotifications() {
  const panel = document.getElementById('notificationsPanel');
  panel.classList.toggle('active');
}

/**
 * Toggle shortcuts modal
 */
function toggleShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  modal.classList.toggle('active');
}

/**
 * Close modal
 */
function closeModal() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });
}

/**
 * Navigate to section by index
 */
function navigateToSection(index) {
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[index]) {
    navItems[index].click();
  }
}

// ============================================================
// NOTIFICATIONS SYSTEM
// ============================================================

/**
 * Add notification
 */
function addNotification(message, type = 'info') {
  const list = document.getElementById('notificationsList');
  const badge = document.getElementById('notificationBadge');
  
  const notification = document.createElement('div');
  notification.className = 'notification-item';
  notification.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : type === 'warning' ? 'alert-triangle' : 'bell'}"></i>
    <span>${message}</span>
    <span class="notification-time">${new Date().toLocaleTimeString()}</span>
  `;
  
  list.insertBefore(notification, list.firstChild);
  
  notificationCount++;
  badge.textContent = notificationCount;
  badge.classList.remove('hidden');
  
  lucide.createIcons();
  
  // Remove old notifications (keep max 10)
  while (list.children.length > 10) {
    list.removeChild(list.lastChild);
  }
}

// ============================================================
// CUSTOM DATE RANGE
// ============================================================

/**
 * Setup custom date range picker
 */
function setupCustomDateRange() {
  const dateFilter = document.getElementById('dateFilter');
  const dateRangeGroup = document.getElementById('dateRangeGroup');
  
  dateFilter.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      dateRangeGroup.style.display = 'flex';
    } else {
      dateRangeGroup.style.display = 'none';
    }
  });
  
  // Set default dates
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  document.getElementById('endDate').value = today.toISOString().split('T')[0];
  document.getElementById('startDate').value = thirtyDaysAgo.toISOString().split('T')[0];
}

// ============================================================
// REPORTS GENERATION
// ============================================================

/**
 * Setup reports generation
 */
function setupReports() {
  const reportButtons = document.querySelectorAll('[data-report]');
  
  reportButtons.forEach(button => {
    button.addEventListener('click', () => {
      const reportType = button.dataset.report;
      generateReport(reportType);
    });
  });
}

/**
 * Generate report
 */
function generateReport(type) {
  switch (type) {
    case 'summary':
      generateSummaryReport();
      break;
    case 'trend':
      generateTrendReport();
      break;
    case 'user':
      generateUserReport();
      break;
    case 'share':
      generateShareableLink();
      break;
  }
}

/**
 * Generate summary report
 */
function generateSummaryReport() {
  const stats = {
    totalViews: document.getElementById('totalViews').textContent,
    activeUsers: document.getElementById('activeUsers').textContent,
    revenue: document.getElementById('revenue').textContent,
    conversionRate: document.getElementById('conversionRate').textContent
  };
  
  const report = `
CLOUD ANALYTICS DASHBOARD - SUMMARY REPORT
Generated: ${new Date().toLocaleString()}
==========================================

TOTAL VIEWS: ${stats.totalViews}
ACTIVE USERS: ${stats.activeUsers}
REVENUE: ${stats.revenue}
CONVERSION RATE: ${stats.conversionRate}

==========================================
Data cached for offline access
  `;
  
  downloadReport(report, 'summary-report.txt');
  addNotification('Summary report generated', 'success');
}

/**
 * Generate trend report
 */
function generateTrendReport() {
  if (historicalData.length === 0) {
    addNotification('No data available for trend report', 'error');
    return;
  }
  
  const recent = historicalData.slice(-7);
  const report = `
CLOUD ANALYTICS DASHBOARD - TREND REPORT
Generated: ${new Date().toLocaleString()}
==========================================

7-Day Trend Analysis:
${recent.map(d => `${d.date}: ${d.views.toLocaleString()} views`).join('\n')}

Average: ${Math.round(recent.reduce((sum, d) => sum + d.views, 0) / recent.length).toLocaleString()}
Peak: ${Math.max(...recent.map(d => d.views)).toLocaleString()}

==========================================
  `;
  
  downloadReport(report, 'trend-report.txt');
  addNotification('Trend report generated', 'success');
}

/**
 * Generate user behavior report
 */
function generateUserReport() {
  const report = `
CLOUD ANALYTICS DASHBOARD - USER BEHAVIOR REPORT
Generated: ${new Date().toLocaleString()}
==========================================

User Engagement Metrics:
- Active Sessions: ${document.getElementById('activeUsers').textContent}
- Conversion Rate: ${document.getElementById('conversionRate').textContent}
- Average Session Duration: 4m 32s
- Bounce Rate: 32.4%

Top User Segments:
- Desktop Users: 65%
- Mobile Users: 28%
- Tablet Users: 7%

==========================================
  `;
  
  downloadReport(report, 'user-behavior-report.txt');
  addNotification('User behavior report generated', 'success');
}

/**
 * Generate shareable link
 */
function generateShareableLink() {
  const shareLink = `https://analytics.cloud/dashboard/share/${Date.now()}`;
  
  // Copy to clipboard
  navigator.clipboard.writeText(shareLink).then(() => {
    addNotification('Shareable link copied to clipboard', 'success');
  }).catch(() => {
    alert(`Shareable link: ${shareLink}`);
  });
}

/**
 * Download report as file
 */
function downloadReport(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// FILTERING
// ============================================================

/**
 * Setup filter event listeners
 */
function setupFilters() {
  const dateFilter = document.getElementById('dateFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const sourceFilter = document.getElementById('sourceFilter');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');

  const applyFilters = () => {
    const filters = {
      dateRange: dateFilter.value,
      category: categoryFilter.value,
      source: sourceFilter.value
    };

    // Add custom date range if selected
    if (dateFilter.value === 'custom') {
      filters.startDate = startDate.value;
      filters.endDate = endDate.value;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'filter',
        filters: filters
      }));
    }
    
    addNotification('Filters applied', 'success');
  };

  dateFilter.addEventListener('change', applyFilters);
  categoryFilter.addEventListener('change', applyFilters);
  sourceFilter.addEventListener('change', applyFilters);
  startDate.addEventListener('change', applyFilters);
  endDate.addEventListener('change', applyFilters);
}

// ============================================================
// EXPORT FUNCTIONALITY
// ============================================================

/**
 * Setup export buttons
 */
function setupExport() {
  const exportPngBtn = document.getElementById('exportPng');
  const exportCsvBtn = document.getElementById('exportCsv');
  const exportPdfBtn = document.getElementById('exportPdf');

  // Export to PNG
  exportPngBtn.addEventListener('click', () => {
    exportChartAsPNG();
  });

  // Export to CSV
  exportCsvBtn.addEventListener('click', () => {
    exportDataAsCSV();
  });

  // Export to PDF
  exportPdfBtn.addEventListener('click', () => {
    exportAsPDF();
  });
  
  // Setup zoom reset buttons
  setupZoomReset();
}

/**
 * Setup zoom reset buttons
 */
function setupZoomReset() {
  const resetButtons = ['resetZoom', 'lineResetZoom', 'barResetZoom'];
  
  resetButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        Object.values(charts).forEach(chart => {
          if (chart.resetZoom) {
            chart.resetZoom();
          }
        });
      });
    }
  });
}

/**
 * Export current chart as PNG
 */
function exportChartAsPNG() {
  const activeSection = document.querySelector('.content-section.active');
  const canvas = activeSection.querySelector('canvas');
  
  if (canvas) {
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addNotification('Chart exported as PNG', 'success');
  }
}

/**
 * Export data as CSV
 */
function exportDataAsCSV() {
  if (historicalData.length === 0) {
    addNotification('No data to export', 'error');
    return;
  }

  const headers = Object.keys(historicalData[0]);
  const csvContent = [
    headers.join(','),
    ...historicalData.map(row => headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `analytics-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  addNotification('Data exported as CSV', 'success');
}

/**
 * Export as PDF (simulated - creates a text report)
 */
function exportAsPDF() {
  const stats = {
    totalViews: document.getElementById('totalViews').textContent,
    activeUsers: document.getElementById('activeUsers').textContent,
    revenue: document.getElementById('revenue').textContent,
    conversionRate: document.getElementById('conversionRate').textContent
  };
  
  const report = `
CLOUD ANALYTICS DASHBOARD REPORT
Generated: ${new Date().toLocaleString()}
==========================================

EXECUTIVE SUMMARY
----------------
Total Views: ${stats.totalViews}
Active Users: ${stats.activeUsers}
Revenue: ${stats.revenue}
Conversion Rate: ${stats.conversionRate}

DATA OVERVIEW
-------------
Data Points: ${historicalData.length}
Connection Quality: ${performanceMetrics.connectionQuality}
Data Latency: ${performanceMetrics.latency}ms

==========================================
End of Report
  `;
  
  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `analytics-report-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  addNotification('Report exported', 'success');
}

/**
 * Handle export response from server
 * @param {Object} message - Export message from server
 */
function handleExport(message) {
  if (message.format === 'csv') {
    downloadCSV(message.data);
  }
}

/**
 * Download data as CSV file
 * @param {Array} data - Data to convert to CSV
 */
function downloadCSV(data) {
  if (data.length === 0) {
    addNotification('No data to export', 'error');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `analytics-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  addNotification('Data exported as CSV', 'success');
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the application
 */
function init() {
  console.log('Initializing Cloud Analytics Dashboard...');
  
  // Initialize Lucide icons
  lucide.createIcons();
  
  // Initialize charts
  initializeCharts();
  
  // Setup navigation
  setupNavigation();
  
  // Setup filters
  setupFilters();
  
  // Setup custom date range
  setupCustomDateRange();
  
  // Setup export
  setupExport();
  
  // Setup AI analysis
  setupAIAnalysis();
  
  // Setup comparison
  setupComparison();
  
  // Setup theme toggle
  setupThemeToggle();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Setup reports
  setupReports();
  
  // Setup refresh and fullscreen buttons
  document.getElementById('refreshBtn').addEventListener('click', refreshData);
  document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
  
  // Setup window controls
  setupWindowControls();
  
  // Setup file upload
  setupFileUpload();
  
  // Load cached data
  loadCachedData();
  
  // Connect to WebSocket
  connectWebSocket();
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);
