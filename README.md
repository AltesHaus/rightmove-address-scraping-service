# Rightmove Address Scraping Parallel

A TypeScript project for scraping property addresses from Rightmove with parallel processing capabilities.

## Features

- Parallel address scraping for improved performance
- TypeScript with modern ES2022 features
- Clean architecture with interfaces and classes
- Built-in error handling and logging

## Project Structure

```
├── src/
│   └── index.ts          # Main application entry point
├── dist/                 # Compiled JavaScript output
├── tsconfig.json         # TypeScript configuration
├── package.json          # Project dependencies and scripts
└── README.md            # This file
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Run the application:
   ```bash
   npm start
   ```

### Development

For development with hot reloading:
```bash
npm run dev
```

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the compiled application
- `npm run dev` - Run with ts-node for development
- `npm run clean` - Remove compiled output

## Usage

The project includes an `AddressScraper` class that can process multiple URLs in parallel:

```typescript
import { AddressScraper } from './src/index';

const scraper = new AddressScraper();
const addresses = await scraper.scrapeAddresses([
  'https://rightmove.co.uk/property-1',
  'https://rightmove.co.uk/property-2'
]);
```

## License

ISC
