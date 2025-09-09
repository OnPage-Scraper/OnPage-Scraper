# OnPage.dev

A Chrome extension for web scraping with visual element selection and data export.

## Features

- **Visual element selection** with hover highlights
- **Smart scraping** with auto-scroll
- **Data export** to CSV/JSON
- **User authentication** and cloud storage
- **Modern Chrome extension** (Manifest V3)

## Quick Start

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
npm install
npm start
```

### 2. Chrome Extension

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" and select the `extension` folder

## Usage

1. Open the extension popup and sign up/log in
2. Click "Select Elements" to choose what to scrape
3. Click "Start Scraping" to collect data
4. View and export your data in Reports

## Environment Variables

- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens

## Legal Notice

**Use responsibly!** Always respect website terms of service and robots.txt files. Only scrape public data you have permission to access.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License