# Address Resolver API - Docker Usage Guide

## 🚀 Quick Start

### Build and Run with Docker

```bash
# Build the container
docker build -t address-resolver-api .

# Run the container
docker run -d -p 3000:3000 --name address-resolver-api address-resolver-api

# Check if it's running
curl http://localhost:3000/health
```

### Using Docker Compose

```bash
# Start with docker-compose
docker-compose up -d

# Stop
docker-compose down
```

## 📡 API Endpoints

### Health Check
```bash
GET /health
```

### API Information
```bash
GET /
```

### Batch Address Fetching
```bash
POST /addresses
Content-Type: application/json

{
  "properties": [
    { "id": 152205953, "outcode": "SW1W", "incode": "8BT" },
    { "id": 159015824, "outcode": "SW1W", "incode": "9JA" },
    { "id": 164304233, "outcode": "SW1W" }
  ]
}
```

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `MAX_WORKERS` | `4` | Maximum parallel workers |
| `NODE_ENV` | `production` | Node environment |

## 📋 Request/Response Format

### Request
```json
{
  "properties": [
    {
      "id": 152205953,
      "outcode": "SW1W",     // Required: First part of postcode
      "incode": "8BT"        // Optional: Second part of postcode
    }
  ]
}
```

### Response
```json
{
  "success": true,
  "processed": 3,
  "results": [
    {
      "id": 152205953,
      "address": "6, Whistler Square, London, SW1W 8BT",
      "success": true,
      "confidence": 0.9,
      "source": "rightmove_land_registry",
      "metadata": {
        "stepUsed": 2,
        "strategy": "full-postcode-postcode-year-price",
        "apiResponseTime": 8234
      }
    },
    {
      "id": 999999999,
      "address": null,
      "success": false,
      "confidence": 0,
      "source": "error",
      "error": "All steps failed: GET request failed: Not Found"
    }
  ],
  "summary": {
    "successful": 2,
    "failed": 1,
    "totalTime": 10566,
    "averageTime": 3522
  }
}
```

## 🎯 Address Resolution Strategy

The API uses a smart 3-step strategy:

1. **Friend API** (Fastest, Confidence: 1.0)
   - Tries your friend's API first
   - Returns immediately if found

2. **Full Postcode Land Registry** (Comprehensive, Confidence: 0.9)
   - Combines outcode + incode (e.g., "SW1W 8BT")
   - Scrapes Rightmove + verifies with UK Land Registry

3. **Outcode Only Fallback** (Flexible, Confidence: 0.9)
   - Uses just the outcode (e.g., "SW1W")
   - When full postcode fails but outcode works

## 💡 Usage Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:3000/addresses', {
  properties: [
    { id: 152205953, outcode: 'SW1W', incode: '8BT' },
    { id: 159015824, outcode: 'SW1W', incode: '9JA' }
  ]
});

console.log('Results:', response.data.results);
```

### Python
```python
import requests

response = requests.post('http://localhost:3000/addresses', json={
    'properties': [
        {'id': 152205953, 'outcode': 'SW1W', 'incode': '8BT'},
        {'id': 159015824, 'outcode': 'SW1W', 'incode': '9JA'}
    ]
})

print('Results:', response.json()['results'])
```

### cURL
```bash
curl -X POST http://localhost:3000/addresses \
  -H "Content-Type: application/json" \
  -d '{
    "properties": [
      {"id": 152205953, "outcode": "SW1W", "incode": "8BT"},
      {"id": 159015824, "outcode": "SW1W", "incode": "9JA"}
    ]
  }'
```

## 🔒 Production Deployment

### Resource Requirements
- **CPU**: 1-2 cores minimum
- **Memory**: 2-4GB recommended
- **Storage**: 1GB for container + logs

### Scaling
```bash
# Scale with docker-compose
docker-compose up -d --scale address-resolver-api=3

# Scale manually
docker run -d -p 3001:3000 address-resolver-api
docker run -d -p 3002:3000 address-resolver-api
```

### Load Balancer Example (nginx)
```nginx
upstream address_resolver {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 80;
    location / {
        proxy_pass http://address_resolver;
    }
}
```

## 🐛 Troubleshooting

### Container Logs
```bash
docker logs address-resolver-api
```

### Container Stats
```bash
docker stats address-resolver-api
```

### Restart Container
```bash
docker restart address-resolver-api
```

### Remove Container
```bash
docker stop address-resolver-api
docker rm address-resolver-api
```

## 📊 Performance

- **Parallel Processing**: Up to 4 concurrent workers by default
- **Batch Limit**: 100 properties per request
- **Average Response Time**: 2-5 seconds per property
- **Memory Usage**: ~100-200MB per worker

## 🎉 Success!

Your Address Resolver API is now containerized and ready for production!

🔗 **API Endpoint**: `http://localhost:3000/addresses`  
📚 **Documentation**: `http://localhost:3000/`  
💚 **Health Check**: `http://localhost:3000/health`