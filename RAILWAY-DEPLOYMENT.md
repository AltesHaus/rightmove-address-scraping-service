# Railway Deployment Guide

This guide covers deploying the Address Resolver API to Railway with Redis queue and multiple workers for bulk processing.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Railway API   │    │  Railway Redis  │    │ Railway Workers │
│   (Web Process) │◄──►│   (Database)    │◄──►│ (Worker Process)│
│                 │    │                 │    │                 │
│ - Single /resolve│    │ - Job Queue     │    │ - Process Queue │
│ - Bulk /resolve  │    │ - Progress      │    │ - Browser Pool  │
│ - Progress API   │    │ - Results       │    │ - Concurrency   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Deployment Steps

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Connect your GitHub repository

### 2. Add Redis Database

1. In Railway dashboard, click "Add Service"
2. Select "Database" → "Redis"
3. Note the connection URL (automatically set as `REDIS_URL`)

### 3. Deploy API Service

1. Click "Add Service" → "GitHub Repo"
2. Select your repository
3. Set environment variables:
   ```
   NODE_ENV=production
   WORKER_CONCURRENCY=3
   PORT=3000
   ```

### 4. Deploy Worker Services

For horizontal scaling, deploy multiple worker instances:

1. Add another service from the same repo
2. Override start command: `npm run start:worker`
3. Set same environment variables as API
4. Scale to 2-3 worker instances for better performance

### 5. Environment Variables

Set these in Railway dashboard:

```bash
# Automatically provided by Railway
REDIS_URL=redis://...

# Your configuration
NODE_ENV=production
WORKER_CONCURRENCY=3
PORT=3000

# Optional tuning
MAX_BULK_PROPERTIES=10000
DEFAULT_TIMEOUT_MS=60000
MAX_REQUESTS_PER_MINUTE=100
```

## 📊 Scaling Configuration

### Worker Scaling
- **Small workload**: 1-2 workers, concurrency=2
- **Medium workload**: 2-3 workers, concurrency=3  
- **Large workload**: 3-5 workers, concurrency=4

### Memory Requirements
- **API Service**: 512MB - 1GB
- **Worker Service**: 1GB - 2GB (for browser automation)
- **Redis**: 512MB - 1GB

## 🔧 API Endpoints

Once deployed, your API will have these endpoints:

### Single Resolution
```bash
POST https://your-app.railway.app/resolve
{
  "propertyId": "164914241"
}
```

### Bulk Processing
```bash
POST https://your-app.railway.app/resolve/bulk
{
  "propertyIds": ["164914241", "102265211", ...],
  "priority": "high"
}
```

### Progress Monitoring
```bash
GET https://your-app.railway.app/resolve/bulk/{jobId}/progress
```

### Results Retrieval
```bash
GET https://your-app.railway.app/resolve/bulk/{jobId}/results
```

## 🧪 Testing the Deployment

### 1. Health Check
```bash
curl https://your-app.railway.app/health
```

### 2. Single Property Test
```bash
curl -X POST https://your-app.railway.app/resolve \
  -H "Content-Type: application/json" \
  -d '{"propertyId": "164914241"}'
```

### 3. Bulk Processing Test
```bash
curl -X POST https://your-app.railway.app/resolve/bulk \
  -H "Content-Type: application/json" \
  -d '{"propertyIds": ["164914241", "102265211"]}'
```

## 📈 Performance Expectations

### Single Properties
- **Processing Time**: 10-30 seconds per property
- **Success Rate**: ~15-25% (varies by data availability)
- **Throughput**: ~2-6 properties per minute per worker

### Bulk Processing
- **100 properties**: ~10-30 minutes
- **1,000 properties**: ~2-5 hours  
- **10,000 properties**: ~8-24 hours
- **100,000 properties**: ~3-10 days (with proper scaling)

## 🔍 Monitoring & Debugging

### Queue Statistics
```bash
GET https://your-app.railway.app/queue/stats
```

### Railway Logs
- Monitor both API and Worker logs in Railway dashboard
- Look for browser automation errors
- Check Redis connection issues

### Common Issues
1. **Browser timeouts**: Increase `DEFAULT_TIMEOUT_MS`
2. **Memory issues**: Scale worker memory or reduce concurrency
3. **Rate limiting**: Rightmove may block high-frequency requests

## 💰 Cost Estimation

### Railway Pricing (approximate)
- **API Service**: $5-10/month (Hobby plan)
- **Worker Services**: $10-20/month per worker
- **Redis Database**: $5-10/month
- **Total for 100K properties**: $30-60/month

### Optimization Tips
- Use hobby plan for testing
- Scale workers only when needed
- Monitor usage to optimize costs

## 🔒 Security Considerations

1. **No API keys exposed** in this basic version
2. **Rate limiting** should be implemented for production
3. **Input validation** is included
4. **Graceful shutdown** handling included

## 🚀 Ready for 100K Properties!

This setup can handle your 100K property database:

1. **Initial bulk run**: Process all 100K properties
2. **Ongoing updates**: Handle daily/weekly additions
3. **Horizontal scaling**: Add more workers as needed
4. **Progress monitoring**: Track processing in real-time

The system is designed to be resilient, scalable, and cost-effective for your use case.