# Cloud Analytics Dashboard

A professional, feature-rich real-time analytics desktop application built with Electron, featuring AI-powered analysis, interactive charts, live data streaming, and advanced data visualization capabilities.

## Features

### Core Features
- **Real-time Analytics Dashboard**: Interactive charts with live data updates every 2 seconds
- **Live Data Streaming**: WebSocket-based real-time data feed with automatic reconnection
- **Multiple Chart Types**: Line, Bar, and Pie charts using Chart.js with zoom and pan support
- **Data Filtering**: Filter data by date range (including custom dates), category, or source
- **Professional UI**: Minimal, modern design with Lucide icons and light/dark theme support
- **Export Options**: Export charts as PNG, data as CSV, or generate comprehensive reports

### Advanced Features (Unique/Not Commonly Added)
- **AI-Powered Analysis**:
  - Anomaly detection using statistical analysis (Z-score method)
  - Predictive insights with confidence levels
  - Smart insights generation from data patterns
  - Actionable recommendations based on data trends
- **Data Comparison**: Compare metrics between different time periods with visual change indicators
- **Performance Metrics Panel**: Real-time monitoring of data latency, connection quality, and data points
- **Data Caching & Offline Mode**: Automatic data caching in localStorage for offline access
- **Keyboard Shortcuts**: Full keyboard navigation (R=refresh, F=fullscreen, T=theme, N=notifications, ?=help, 1-8=navigate)
- **Notifications System**: Real-time alerts with toast notifications and notification center
- **Report Generation**: Generate summary, trend, and user behavior reports with shareable links
- **Chart Zoom & Pan**: Interactive chart zooming and panning for detailed analysis
- **Theme Toggle**: Switch between dark and light themes with persistent preference
- **Custom Date Range**: Select any date range for filtered analysis

## Project Structure

```
cloudanalytics/
├── main.js           # Electron main process
├── index.html        # Frontend HTML structure with Lucide icons
├── styles.css        # Minimal professional CSS with theme support
├── renderer.js       # Frontend JavaScript (charts, AI, WebSocket, all features)
├── backend.js        # Node.js backend (WebSocket server, data processing, AI)
├── package.json      # Project dependencies
└── README.md         # This file
```

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

### Step 1: Start the Backend Server

Open a terminal and run:
```bash
node backend.js
```

The WebSocket server will start on port 8080. You should see:
```
WebSocket server running on port 8080
Waiting for client connections...
```

### Step 2: Start the Electron App

Open a new terminal and run:
```bash
npm start
```

The Cloud Analytics Dashboard window will open.

## Usage

### Navigation

Use the sidebar to navigate between different sections:
- **Dashboard**: Overview with real-time traffic and category distribution
- **AI Analysis**: Run AI-powered anomaly detection, predictions, and insights
- **Comparison**: Compare data between different time periods
- **Trends**: Detailed line chart with zoom and pan
- **Analytics**: Bar chart for comparative analysis
- **Distribution**: Pie chart showing category breakdown
- **Performance**: Monitor system performance metrics
- **Reports**: Generate and download various report types

### Keyboard Shortcuts

- **R**: Refresh data
- **F**: Toggle fullscreen
- **T**: Toggle dark/light theme
- **N**: Toggle notifications panel
- **?**: Show keyboard shortcuts modal
- **1-8**: Navigate to sections (1=Dashboard, 2=AI Analysis, etc.)
- **Esc**: Close modals

### AI Analysis

Click "Run Analysis" in the AI Analysis section to:
- Detect anomalies in your data using statistical methods
- Get predictions for the next period with confidence levels
- Discover smart insights from your data patterns
- Receive actionable recommendations

### Comparison

Select two different time periods and click "Compare" to see:
- Side-by-side metric comparison
- Percentage change indicators
- Visual positive/negative change indicators

### Filtering

Use the header controls to filter data:
- **Date Range**: Today, This Week, This Month, This Quarter, This Year, or Custom Range
- **Category**: All, Sales, Traffic, Users, Revenue
- **Source**: All, Web, Mobile, API
- **Custom Range**: Select specific start and end dates

### Export

- **Export PNG**: Downloads the currently visible chart as a PNG image
- **Export CSV**: Downloads the current filtered data as a CSV file
- **Export PDF**: Generates a comprehensive report in text format

### Reports

Generate different types of reports:
- **Summary Report**: Overview of all current metrics
- **Trend Report**: 7-day trend analysis with peak values
- **User Behavior Report**: User engagement metrics and segmentation
- **Shareable Link**: Creates a shareable dashboard link (copied to clipboard)

### Theme

Click the moon/sun icon in the sidebar footer to toggle between dark and light themes. Your preference is saved automatically.

### Connection Status

The sidebar footer shows the WebSocket connection status:
- 🔴 Red dot: Disconnected or connecting (uses cached data)
- 🟢 Green dot: Connected and streaming live data

## Technology Stack

- **Electron**: Desktop application framework
- **Chart.js**: Interactive charting library with zoom plugin
- **Lucide Icons**: Professional SVG icon library
- **WebSocket (ws)**: Real-time data streaming
- **Node.js**: Backend data processing
- **LocalStorage**: Data caching for offline mode

## Data Flow

1. Backend generates simulated analytics data every 2 seconds
2. WebSocket server broadcasts data to connected clients
3. Frontend receives data via WebSocket client
4. Charts update in real-time with new data points
5. Data is cached in localStorage for offline access
6. Users can filter data, run AI analysis, compare periods, and export results

## AI Analysis Details

The AI analysis feature uses statistical methods to provide insights:

- **Anomaly Detection**: Uses Z-score analysis (2 standard deviations from mean) to identify outliers
- **Predictions**: Based on 7-day moving average with 85% confidence level
- **Insights**: Analyzes peak values, averages, and weekly changes
- **Recommendations**: Provides actionable suggestions based on traffic patterns and weekend/weekday comparisons

## Development

To run in development mode with DevTools:
```bash
npm run dev
```

## Notes

- The application uses simulated data for demonstration purposes
- WebSocket server must be running before starting the Electron app
- Charts automatically update with real-time data every 2 seconds
- Historical data is updated every 30 seconds
- Data is automatically cached for offline access
- Theme preference is saved and persists across sessions
- Keyboard shortcuts work throughout the application (except in input fields)

## Unique Features

This dashboard includes features not commonly found in similar applications:

1. **AI-powered anomaly detection** - Statistical analysis to find data outliers
2. **Predictive analytics** - Future predictions with confidence levels
3. **Smart recommendations** - Actionable insights based on data patterns
4. **Period comparison** - Side-by-side comparison of different time ranges
5. **Performance monitoring** - Real-time latency and connection quality tracking
6. **Offline mode** - Full functionality with cached data when disconnected
7. **Comprehensive keyboard shortcuts** - Power user navigation
8. **Multiple report types** - Summary, trend, and user behavior reports
9. **Shareable links** - Generate shareable dashboard URLs
10. **Chart zoom & pan** - Interactive chart exploration

## License

MIT
