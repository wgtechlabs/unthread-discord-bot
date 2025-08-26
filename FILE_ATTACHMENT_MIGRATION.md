# File Attachment Migration Guide

## Overview

The Discord bot has been successfully migrated from legacy webhook handling to a modern Redis queue architecture with comprehensive file attachment support. This migration provides enhanced reliability, scalability, and security for file processing.

## Architecture Changes

### Before (Legacy)
- Direct webhook processing
- Attachment links only (markdown format)
- Single point of failure
- No file validation
- Limited error handling

### After (Modern)
- Redis queue-based processing
- Buffer-based file handling
- Comprehensive security validation
- Discord native file uploads
- Retry logic and error recovery
- Dead letter queue for failed events

## File Attachment Features

### Supported File Formats
- **JPEG** (`image/jpeg`, `image/jpg`)
- **PNG** (`image/png`)
- **GIF** (`image/gif`)
- **WebP** (`image/webp`)

### File Processing Limits
- **Maximum file size:** 10MB per file
- **Maximum files per batch:** 10 files
- **Maximum total batch size:** 50MB
- **Concurrent processing:** 3 files maximum

### Security Features
- **Magic number validation:** File signature verification
- **MIME type validation:** Multi-layer detection
- **Filename sanitization:** Removes dangerous characters
- **Path traversal protection:** Prevents directory attacks
- **Content validation:** Verifies file integrity

### Performance Optimizations
- **Buffer pooling:** Efficient memory reuse
- **Garbage collection hints:** Memory optimization
- **Concurrent processing:** Multiple files in parallel
- **Download timeouts:** 15 seconds per file
- **Upload timeouts:** 30 seconds per batch

## Configuration

### Environment Variables
```bash
# Required for queue processing
REDIS_URL=redis://localhost:6379

# Existing webhook configuration
UNTHREAD_WEBHOOK_SECRET=your_webhook_secret
UNTHREAD_API_KEY=your_api_key
DISCORD_BOT_TOKEN=your_bot_token
```

### File Processing Configuration
The file attachment system can be configured in `src/config/attachments.ts`:

```typescript
export const DISCORD_ATTACHMENT_CONFIG = {
  maxFileSize: 10 * 1024 * 1024,    // 10MB per file
  maxFiles: 10,                      // Maximum files per batch
  supportedFormats: [                // Allowed file types
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ],
  retryAttempts: 3,                  // Retry failed operations
  memoryThreshold: 100 * 1024 * 1024 // 100MB memory limit
};
```

## Queue System

### Event Types
- **message_created:** Regular messages from Unthread
- **attachment:** File uploads requiring processing
- **conversation_updated:** Status changes and updates
- **thread_create:** New conversation creation

### Queue Configuration
```typescript
export const QUEUE_CONFIG = {
  webhookQueue: 'webhook:events',
  deadLetterQueue: 'webhook:dead_letter',
  processingQueue: 'webhook:processing',
  defaultMaxRetries: 3,
  deduplicationTTL: 300  // 5 minutes
};
```

### Priority Levels
- **High (3):** Conversation status updates
- **Medium (2):** File attachments
- **Normal (1):** Regular messages
- **Low (0):** Other events

## File Processing Flow

1. **Webhook Reception:** Unthread sends webhook with file metadata
2. **Event Queuing:** File information queued to Redis with priority
3. **Queue Processing:** Consumer fetches events from Redis
4. **File Download:** Files downloaded from Unthread with validation
5. **Security Validation:** Magic number, MIME type, and size checks
6. **Buffer Processing:** Files converted to memory buffers
7. **Discord Upload:** Files uploaded as native Discord attachments
8. **Error Handling:** Failed operations retried or moved to dead letter queue

## Monitoring and Observability

### Key Metrics
- File processing success rate
- Average processing time per file
- Memory usage patterns
- Queue depth and processing latency
- Error rates by file type

### Logging
```typescript
// Example log messages
[INFO]: Processing 3 file attachments for channel 123456
[DEBUG]: Downloaded 2.5MB file: image.png
[INFO]: Successfully uploaded 3 files to Discord channel 123456
[ERROR]: File validation failed: invalid signature detected
```

### Health Monitoring
```bash
# Check queue status
GET /health
{
  "discord": { "status": "connected" },
  "redis": { "status": "connected" },
  "queueSizes": {
    "webhook:events": 5,
    "webhook:dead_letter": 0,
    "webhook:processing": 2
  }
}
```

## Testing

### Unit Tests
```bash
# Run attachment system tests
yarn build && node dist/test-attachments.js
```

### Integration Testing
```bash
# Start with Redis connection
REDIS_URL=redis://localhost:6379 yarn start

# Monitor logs for file processing
tail -f logs/discord-bot.log | grep attachment
```

## Troubleshooting

### Common Issues

#### Files Not Processing
- **Check Redis connection:** Ensure REDIS_URL is configured
- **Verify file format:** Only JPEG, PNG, GIF, WebP supported
- **Check file size:** Maximum 10MB per file, 50MB per batch
- **Review logs:** Look for validation or download errors

#### Memory Issues
- **Monitor usage:** Large files consume significant memory
- **Check concurrency:** Limited to 3 concurrent downloads
- **Garbage collection:** Enable with `--expose-gc` flag

#### Queue Backlog
- **Check consumer status:** Ensure consumer is running
- **Monitor dead letter queue:** Review failed events
- **Scale processing:** Add more consumer instances if needed

### Error Recovery
```bash
# Restart consumer if stuck
docker restart discord-bot

# Clear problematic queue (emergency only)
redis-cli FLUSHDB

# Review dead letter queue
redis-cli LRANGE webhook:dead_letter 0 -1
```

## Migration Impact

### Breaking Changes
- **File handling:** Attachments now uploaded as Discord files instead of links
- **Processing delay:** Files queued for processing (typically <5 seconds)
- **Memory requirements:** Increased due to buffer processing
- **Redis dependency:** Required for queue functionality

### Benefits
- **Reliability:** Failed files retried automatically
- **Security:** Comprehensive validation prevents malicious files
- **Performance:** Concurrent processing and memory optimization
- **Monitoring:** Detailed metrics and observability
- **Scalability:** Queue-based architecture supports multiple consumers

## Development

### Adding New File Types
1. Update `supportedFormats` in `attachments.ts`
2. Add file signatures to `FILE_SIGNATURES`
3. Test with sample files
4. Update documentation

### Custom Validation
```typescript
// Add custom validation in DiscordAttachmentHandler
private async validateCustomRules(buffer: Buffer): Promise<boolean> {
  // Your custom validation logic
  return true;
}
```

### Queue Monitoring
```typescript
// Get queue status
const queueManager = getQueueManager();
const status = await queueManager.getQueueStatus();
console.log('Queue status:', status);
```

## Performance Considerations

### Memory Management
- Files processed in memory for performance
- Buffer pooling reduces allocation overhead
- Garbage collection triggered for large operations
- Memory threshold monitoring (100MB limit)

### Network Optimization
- Connection pooling for HTTP requests
- Timeout management (15s download, 30s upload)
- Retry logic with exponential backoff
- Progress tracking for large files

### Concurrency Control
- Maximum 3 files processed simultaneously
- Batch processing for multiple files
- Queue-based load balancing
- Dead letter queue for failed events

This migration establishes a robust, scalable foundation for file attachment processing while maintaining compatibility with existing Discord bot functionality.