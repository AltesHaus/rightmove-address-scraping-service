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

### Parallel Address Fetching

The system uses worker threads to fetch addresses in parallel with two-step fallback:

1. **Step 1**: Friend API (high confidence)
2. **Step 2**: Rightmove + UK Land Registry verification (requires postcode input)

**Note**: Postcodes, coordinates, and images are not automatically extracted. Provide postcodes externally for Step 2 Land Registry verification.

#### Environment Variables Required

```bash
# Supabase configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Friend API configuration (optional - has defaults)
FRIEND_API_BASE_URL=https://your-api-url
FRIEND_API_USER=your-email@example.com
```

#### Option 1: With Supabase (Production)

The main script fetches property IDs from Supabase and processes them:

```bash
npm run build
npm start
```

#### Option 2: Standalone Usage (Custom Property IDs)

Use the example module to process your own list of property IDs:

```javascript
const { fetchAddressesInParallel } = require('./example-usage');

// Property data with optional postcodes for Land Registry verification
const properties = [
  { id: 123456789, postcode: 'SW1W 8DB' },
  { id: 987654321, postcode: 'NW3 7RT' },
  { id: 456789123 } // No postcode - will only use Friend API
];

const results = await fetchAddressesInParallel(properties, {
  workerCount: 4,
  onProgress: (progress) => {
    console.log(`${progress.completed}/${progress.total} completed`);
  }
});

console.log(`Found ${results.successful} addresses out of ${results.total}`);
```

#### Database Schema

Your Supabase table (`rightmove_properties_v2`) should have these columns:

```sql
CREATE TABLE rightmove_properties_v2 (
  id INTEGER PRIMARY KEY,
  outcode TEXT, -- First part of postcode from API (e.g., "SW1W")
  incode TEXT, -- Second part of postcode from API (e.g., "8DB")
  processed_value TEXT,
  success BOOLEAN,
  confidence DECIMAL,
  source TEXT,
  error TEXT,
  metadata JSONB,
  processed_at TIMESTAMP
);
```

## License

ISC
