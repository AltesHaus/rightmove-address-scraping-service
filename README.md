# AddressResolver

A comprehensive property address resolution system that combines Rightmove property data with UK Land Registry records to provide complete address information.

## 🏗️ **Project Structure**

### 1. **TypeScript Pipeline** (`src/`)
Core address resolution pipeline built with TypeScript:
- **AddressResolver.ts** - Main pipeline orchestrator
- **Step1FriendAPI.ts** - Friend API integration
- **Step2LandRegistry.ts** - Land Registry integration
- **Types & utilities** - Supporting infrastructure

### 2. **Enhanced API** (`get-sales-api-address/rightmove-address-finder/`)
Production-ready Node.js API with Land Registry integration:
- **server-enhanced.js** - Main API server
- **land-registry-api-client.js** - Corrected SPARQL implementation
- **Test scripts** - Comprehensive testing suite

### 3. **Railway Scraper** (`get-sales-api-address/right-move-railway-scraper/`)
Deployable Rightmove scraper for Railway platform:
- **server.js** - Standalone scraper API
- **Railway configuration** - Deployment ready
- **Docker support** - Containerized deployment

## 🚀 **Quick Start**

### Pipeline (TypeScript)
```bash
npm install
npm run build
npm start
```

### Enhanced API
```bash
cd get-sales-api-address/rightmove-address-finder
npm install
npm start
```

### Railway Scraper
```bash
cd get-sales-api-address/right-move-railway-scraper/rightmove-scraper
npm install
npm start
```

## 🧪 **Testing**

### Test Land Registry Integration
```bash
cd get-sales-api-address/rightmove-address-finder
npm run test-land-registry
```

### Test Complete Flow
```bash
npm run test-complete
```

### Test SPARQL Queries
```bash
npm run test-exact
```

## 📊 **Key Features**

- ✅ **Rightmove Data Extraction** - Property details and sales history
- ✅ **Land Registry Integration** - Verified property records
- ✅ **Corrected SPARQL Queries** - Reliable Land Registry searches
- ✅ **Multiple Search Strategies** - Fallback mechanisms for maximum coverage
- ✅ **Railway Deployment Ready** - Production deployment configuration
- ✅ **Comprehensive Testing** - Full test suite for all components

## 🎯 **Address Resolution Process**

1. **Extract** property data from Rightmove (postcode, sales history)
2. **Search** UK Land Registry using corrected SPARQL queries
3. **Match** transactions using multiple strategies (price, date, postcode)
4. **Resolve** complete address with high confidence
5. **Fallback** to constructed address if no Land Registry match

## 💡 **Technical Highlights**

- **Corrected SPARQL Implementation**: Fixes previous query issues
- **Individual Filter Strategy**: Avoids overly restrictive combined filters
- **Comprehensive Field Selection**: Includes transaction ID, property types
- **Enhanced Address Formatting**: Proper street name capitalization and London detection
- **Multiple Deployment Options**: TypeScript pipeline, Node.js API, Railway scraper

## 🔧 **Configuration**

Each component has its own configuration:
- **Pipeline**: `tsconfig.json`, `package.json`
- **API**: `package.json` with enhanced dependencies
- **Scraper**: Railway-specific configuration files

## 📈 **Success Metrics**

The system successfully resolves addresses for properties with sales history, including high-value transactions like the £45M Whistler Square property (Transaction ID: 2131FCF5-ADE5-86E8-E063-4804A8C0372B).

---

**Note**: This project demonstrates a complete address resolution pipeline from property listings to verified Land Registry records, with production-ready deployment options.