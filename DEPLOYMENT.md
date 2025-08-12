# Address Resolver Pipeline - Deployment Guide

## 🏗️ **Architecture Overview**

The Address Resolver Pipeline implements a robust two-step approach:

1. **Step 1: Friend API** - Checks your friend's API first (if configured)
2. **Step 2: Rightmove + Land Registry** - Extracts from Rightmove, verifies with UK Land Registry using corrected SPARQL
3. **Robust Logging** - Logs when no address is found anywhere

## 🚀 **Quick Start**

### **Local Development**
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start API server
npm start

# Or run in development mode
npm run dev:api
```

### **Test the API**
```bash
# Test single property
curl "http://localhost:3000/api/resolve/159860288"

# Test batch
curl -X POST "http://localhost:3000/api/resolve-batch" \
  -H "Content-Type: application/json" \
  -d '{"propertyIds": ["159860288", "152205953"]}'

# Run comprehensive test
node test-pipeline-api.js
```

## 🐳 **Docker Deployment**

### **Build and Run**
```bash
# Build Docker image
npm run docker:build

# Run container
npm run docker:run

# Or use Docker Compose
npm run docker:compose
```

### **Manual Docker Commands**
```bash
# Build
docker build -t address-resolver .

# Run with environment variables
docker run -p 3000:3000 \
  -e FRIEND_API_URL="https://your-friends-api.com" \
  -e FRIEND_API_KEY="your-key" \
  address-resolver

# Run with Docker Compose
docker-compose up --build
```

## 🚄 **Railway Deployment**

### **Automatic Deployment**
1. Connect your GitHub repository to Railway
2. Railway will automatically detect the `railway.toml` configuration
3. Set environment variables in Railway dashboard:
   ```
   FRIEND_API_URL=https://your-friends-api.com
   FRIEND_API_KEY=your-api-key
   ```

### **Manual Railway Deployment**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Deploy
railway up

# Set environment variables
railway variables set FRIEND_API_URL=https://your-friends-api.com
railway variables set FRIEND_API_KEY=your-api-key
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Required
PORT=3000
NODE_ENV=production

# Optional: Friend API configuration
FRIEND_API_URL=https://your-friends-api.com
FRIEND_API_KEY=your-api-key

# Optional: Pipeline configuration
PIPELINE_TIMEOUT_MS=180000
PIPELINE_RETRY_ATTEMPTS=1
```

### **Docker Environment File**
Create `.env` file:
```
FRIEND_API_URL=https://your-friends-api.com
FRIEND_API_KEY=your-api-key
```

## 📡 **API Endpoints**

### **Health Check**
```bash
GET /health
```
Returns pipeline status and configuration.

### **Single Property Resolution**
```bash
GET /api/resolve/:propertyId
```
**Response:**
```json
{
  "success": true,
  "propertyId": "159860288",
  "found": true,
  "fullAddress": "1, The Courtyard, London, N1 1JZ",
  "confidence": 0.9,
  "source": "rightmove_land_registry",
  "processingTime": 12543,
  "metadata": {
    "stepUsed": 2,
    "strategy": "exact-price",
    "verifiedData": {
      "price": "£1,200,000",
      "date": "2015-05-01",
      "propertyType": "terraced"
    }
  }
}
```

### **Batch Property Resolution**
```bash
POST /api/resolve-batch
Content-Type: application/json

{
  "propertyIds": ["159860288", "152205953", "116095696"]
}
```

### **Simple Address (Backwards Compatibility)**
```bash
GET /api/address/:propertyId
```
**Response:**
```json
{
  "fullAddress": "1, The Courtyard, London, N1 1JZ",
  "found": true
}
```

## 🔄 **Pipeline Flow**

```
Input: Property ID
    ↓
Step 1: Friend API
    ├─ ✅ Success → Return address (high confidence)
    └─ ❌ Failed → Continue to Step 2
        ↓
Step 2: Rightmove + Land Registry
    ├─ Extract from Rightmove (postcode, sales history)
    ├─ Search Land Registry with SPARQL queries:
    │   ├─ Exact price match
    │   ├─ Date + price range
    │   └─ Postcode + year
    ├─ ✅ Land Registry match → Return verified address
    └─ ❌ No match → Return constructed address (low confidence)
        ↓
Output: Address result with found: true/false
```

## 📊 **Response Format**

All endpoints return consistent format:
```json
{
  "success": boolean,
  "propertyId": "string",
  "found": boolean,              // true if address found
  "fullAddress": "string|null",  // The actual address
  "confidence": number,          // 0.0 - 1.0 confidence score
  "source": "friend_api|rightmove_land_registry",
  "processingTime": number,      // milliseconds
  "metadata": {
    "stepUsed": number,          // Which pipeline step succeeded
    "strategy": "string",        // Land Registry search strategy used
    "verifiedData": object       // Additional verification details
  },
  "error": "string"              // Error message if found: false
}
```

## 🐛 **Troubleshooting**

### **Common Issues**

1. **Playwright Installation**
   ```bash
   # If browser installation fails
   npx playwright install chromium --with-deps
   ```

2. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

3. **Docker Build Issues**
   ```bash
   # Clear Docker cache
   docker system prune -a
   docker build --no-cache -t address-resolver .
   ```

4. **Memory Issues**
   ```bash
   # Increase Docker memory limit
   docker run -m 2g -p 3000:3000 address-resolver
   ```

### **Logs and Debugging**

```bash
# View Docker logs
docker logs <container-id>

# Railway logs
railway logs

# Local debugging
npm run dev:api  # TypeScript with hot reload
```

## 🔒 **Security**

- Container runs as non-root user
- No sensitive data in logs
- Environment variables for API keys
- CORS enabled for web integration
- Health checks for monitoring

## 📈 **Performance**

- **Single property**: 5-15 seconds
- **Batch (3 properties)**: 15-45 seconds
- **Memory usage**: ~200MB per container
- **Concurrent requests**: Limited by Playwright instances

## 🚀 **Production Recommendations**

1. **Resource Allocation**:
   - RAM: 1-2GB minimum
   - CPU: 1-2 cores
   - Storage: 1GB+ for browsers

2. **Monitoring**:
   - Health endpoint monitoring
   - Response time alerts
   - Error rate tracking

3. **Scaling**:
   - Horizontal scaling with load balancer
   - Queue system for batch processing
   - Caching for repeated requests

4. **Environment**:
   - Use production Docker image
   - Set NODE_ENV=production
   - Configure proper logging

---

## 🎯 **Expected Results**

For property ID `159860288`:
```json
{
  "found": true,
  "fullAddress": "1, The Courtyard, London, N1 1JZ",
  "source": "rightmove_land_registry",
  "confidence": 0.9
}
```

The pipeline is **production-ready** and handles:
- ✅ Friend API integration (Step 1)
- ✅ Rightmove extraction (Step 2a)
- ✅ Land Registry verification (Step 2b)
- ✅ Robust error handling and logging
- ✅ Docker containerization
- ✅ Railway deployment
- ✅ Batch processing
- ✅ Health monitoring