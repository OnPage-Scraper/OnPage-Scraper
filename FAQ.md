# FAQ

## Getting Started

**Q: How do I install OnPage.dev?**
A: 
1. Clone the repository
2. Set up the backend (see backend/README.md)
3. Load the extension in Chrome (Developer mode → Load unpacked → select `extension` folder)

**Q: Do I need to run the backend server?**
A: Yes, the backend is required for user authentication and report storage.

## Technical Questions

**Q: Why isn't element selection working on some websites?**
A: Some sites use dynamic content, iFrames, or have security policies that block content scripts. Try refreshing the page or using manual CSS selectors.

**Q: The scraper stops early or misses data. Why?**
A: This can happen due to rate limiting, dynamic loading, or selector issues. Try increasing delays or verifying your selectors.

## Data & Storage

**Q: Where is my scraped data stored?**
A: With an account, data is stored in MongoDB. Without an account, data is temporarily stored in browser storage. You can always export as CSV/JSON.

**Q: Is my data secure?**
A: Yes, all data is encrypted in transit, passwords are hashed, and you control your data.

## Legal & Ethical

**Q: Is web scraping legal?**
A: Web scraping legality depends on many factors. Always check robots.txt, respect rate limits, and scrape responsibly. Only scrape public data and respect website terms of service.

## Support

**Q: Where can I get help?**
A: Check GitHub Issues or create a new issue with detailed information, or contact us info@onpage.dev