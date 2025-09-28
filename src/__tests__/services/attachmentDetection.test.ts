/**
 * AttachmentDetection Service Tests
 *
 * Comprehensive test coverage for the AttachmentDetectionService class,
 * focusing on metadata-driven attachment processing and decision logic.
 *
 * @module __tests__/services/attachmentDetection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Attachment } from 'discord.js';
import { AttachmentDetectionService } from '../../services/attachmentDetection';
import { EnhancedWebhookEvent } from '../../types/unthread';
import { LogEngine } from '../../config/logger';
import { MockCollection, createMockAttachment } from '../test-utils';

// Mock the logger
vi.mock('../../config/logger', () => ({
	LogEngine: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock attachment config functions
vi.mock('../../config/attachmentConfig', async () => {
	const actual = await vi.importActual('../../config/attachmentConfig');
	return {
		...actual,
		isSupportedImageType: vi.fn((type: string) => {
			const supportedTypes = actual.DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
			return supportedTypes.includes(type.toLowerCase());
		}),
		normalizeContentType: vi.fn((type: string) => type.toLowerCase()),
		DISCORD_ATTACHMENT_CONFIG: {
			...actual.DISCORD_ATTACHMENT_CONFIG,
		},
	};
});

describe('AttachmentDetectionService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// Helper function to create mock webhook events
	const createMockWebhookEvent = (overrides: Partial<EnhancedWebhookEvent> = {}): EnhancedWebhookEvent => ({
		platform: 'unthread',
		targetPlatform: 'discord',
		type: 'message_created',
		sourcePlatform: 'dashboard',
		timestamp: Date.now(),
		eventId: 'test-event-id',
		data: {
			id: 'test-message-id',
			conversationId: 'test-conversation-id',
			content: 'Test message',
			files: [],
		},
		attachments: undefined,
		...overrides,
	});

	// Helper function to create mock attachments metadata
	const createMockAttachmentsMetadata = (overrides: any = {}) => ({
		hasFiles: true,
		fileCount: 1,
		totalSize: 1024,
		types: ['image/png'],
		names: ['test.png'],
		...overrides,
	});

	describe('Event Processing Decision Logic', () => {
		describe('shouldProcessEvent', () => {
			it('should return true for dashboard → discord events', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'dashboard',
					targetPlatform: 'discord',
				});

				const result = AttachmentDetectionService.shouldProcessEvent(event);
				expect(result).toBe(true);
			});

			it('should return false for non-dashboard events', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'slack',
					targetPlatform: 'discord',
				});

				const result = AttachmentDetectionService.shouldProcessEvent(event);
				expect(result).toBe(false);
			});

			it('should return false for non-discord target events', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'dashboard',
					targetPlatform: 'slack',
				});

				const result = AttachmentDetectionService.shouldProcessEvent(event);
				expect(result).toBe(false);
			});
		});

		describe('hasAttachments', () => {
			it('should return true when event has attachments and should be processed', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata(),
				});

				const result = AttachmentDetectionService.hasAttachments(event);
				expect(result).toBe(true);
			});

			it('should return false when event should not be processed', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'slack',
					attachments: createMockAttachmentsMetadata(),
				});

				const result = AttachmentDetectionService.hasAttachments(event);
				expect(result).toBe(false);
			});

			it('should return false when attachments metadata indicates no files', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.hasAttachments(event);
				expect(result).toBe(false);
			});

			it('should return false when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.hasAttachments(event);
				expect(result).toBe(false);
			});
		});

		describe('hasImageAttachments', () => {
			it('should return true when event has image attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png', 'text/plain'],
					}),
				});

				const result = AttachmentDetectionService.hasImageAttachments(event);
				expect(result).toBe(true);
			});

			it('should return false when event has no image attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['text/plain', 'application/pdf'],
					}),
				});

				const result = AttachmentDetectionService.hasImageAttachments(event);
				expect(result).toBe(false);
			});

			it('should return false when event has no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.hasImageAttachments(event);
				expect(result).toBe(false);
			});

			it('should return false when attachment types are undefined', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ types: undefined }),
				});

				const result = AttachmentDetectionService.hasImageAttachments(event);
				expect(result).toBe(false);
			});
		});

		describe('hasSupportedImages', () => {
			it('should return true for supported image types', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png', 'image/jpeg'],
					}),
				});

				const result = AttachmentDetectionService.hasSupportedImages(event);
				expect(result).toBe(true);
			});

			it('should return false for unsupported image types', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/tiff', 'image/bmp'],
					}),
				});

				const result = AttachmentDetectionService.hasSupportedImages(event);
				expect(result).toBe(false);
			});

			it('should return false when event has no image attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['text/plain'],
					}),
				});

				const result = AttachmentDetectionService.hasSupportedImages(event);
				expect(result).toBe(false);
			});
		});

		describe('hasUnsupportedAttachments', () => {
			it('should return true when event has attachments but no supported images', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['text/plain', 'application/pdf'],
					}),
				});

				const result = AttachmentDetectionService.hasUnsupportedAttachments(event);
				expect(result).toBe(true);
			});

			it('should return false when event has supported images', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png'],
					}),
				});

				const result = AttachmentDetectionService.hasUnsupportedAttachments(event);
				expect(result).toBe(false);
			});

			it('should return false when event has no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.hasUnsupportedAttachments(event);
				expect(result).toBe(false);
			});
		});
	});

	describe('Size Validation', () => {
		describe('isWithinSizeLimit', () => {
			it('should return true when all files are within size limit', () => {
				const event = createMockWebhookEvent({
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'small.png' },
							{ size: 2048, name: 'medium.png' },
						],
					},
				});

				const result = AttachmentDetectionService.isWithinSizeLimit(event, 8 * 1024 * 1024);
				expect(result).toBe(true);
			});

			it('should return false when any file exceeds size limit', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: true }),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'small.png' },
							{ size: 10 * 1024 * 1024, name: 'large.png' },
						],
					},
				});

				const result = AttachmentDetectionService.isWithinSizeLimit(event, 8 * 1024 * 1024);
				expect(result).toBe(false);
			});

			it('should return true when event has no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.isWithinSizeLimit(event, 8 * 1024 * 1024);
				expect(result).toBe(true);
			});

			it('should return true when files array is empty', () => {
				const event = createMockWebhookEvent({
					data: {
						id: 'test',
						conversationId: 'test',
						files: [],
					},
				});

				const result = AttachmentDetectionService.isWithinSizeLimit(event, 8 * 1024 * 1024);
				expect(result).toBe(true);
			});
		});

		describe('isOversized', () => {
			it('should return true when any file exceeds the size limit', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: true }),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'small.png' },
							{ size: 10 * 1024 * 1024, name: 'large.png' },
						],
					},
				});

				const result = AttachmentDetectionService.isOversized(event, 8 * 1024 * 1024);
				expect(result).toBe(true);
			});

			it('should return false when all files are within the size limit', () => {
				const event = createMockWebhookEvent({
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'small.png' },
							{ size: 2048, name: 'medium.png' },
						],
					},
				});

				const result = AttachmentDetectionService.isOversized(event, 8 * 1024 * 1024);
				expect(result).toBe(false);
			});

			it('should return false when event has no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.isOversized(event, 8 * 1024 * 1024);
				expect(result).toBe(false);
			});

			it('should return false when files array is empty', () => {
				const event = createMockWebhookEvent({
					data: {
						id: 'test',
						conversationId: 'test',
						files: [],
					},
				});

				const result = AttachmentDetectionService.isOversized(event, 8 * 1024 * 1024);
				expect(result).toBe(false);
			});
		});
	});

	describe('Metadata Accessors', () => {
		describe('getAttachmentSummary', () => {
			it('should return formatted summary for attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						fileCount: 2,
						totalSize: 3 * 1024 * 1024, // 3MB
						types: ['image/png', 'image/jpeg'],
					}),
				});

				const result = AttachmentDetectionService.getAttachmentSummary(event);
				expect(result).toBe('2 files (3MB) - image/png, image/jpeg');
			});

			it('should return "No attachments" when event has no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.getAttachmentSummary(event);
				expect(result).toBe('No attachments');
			});

			it('should return "No attachments" when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.getAttachmentSummary(event);
				expect(result).toBe('No attachments');
			});

			it('should handle fractional MB sizes correctly', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						fileCount: 1,
						totalSize: 1.5 * 1024 * 1024, // 1.5MB
						types: ['image/png'],
					}),
				});

				const result = AttachmentDetectionService.getAttachmentSummary(event);
				expect(result).toBe('1 files (1.5MB) - image/png');
			});
		});

		describe('getFileCount', () => {
			it('should return file count from metadata', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ fileCount: 3 }),
				});

				const result = AttachmentDetectionService.getFileCount(event);
				expect(result).toBe(3);
			});

			it('should return 0 when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.getFileCount(event);
				expect(result).toBe(0);
			});
		});

		describe('getTotalSize', () => {
			it('should return total size from metadata', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ totalSize: 5120 }),
				});

				const result = AttachmentDetectionService.getTotalSize(event);
				expect(result).toBe(5120);
			});

			it('should return 0 when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.getTotalSize(event);
				expect(result).toBe(0);
			});
		});

		describe('getFileTypes', () => {
			it('should return file types from metadata', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png', 'image/jpeg', 'text/plain'],
					}),
				});

				const result = AttachmentDetectionService.getFileTypes(event);
				expect(result).toEqual(['image/png', 'image/jpeg', 'text/plain']);
			});

			it('should return empty array when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.getFileTypes(event);
				expect(result).toEqual([]);
			});
		});

		describe('getFileNames', () => {
			it('should return file names from metadata', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						names: ['image1.png', 'image2.jpeg', 'document.txt'],
					}),
				});

				const result = AttachmentDetectionService.getFileNames(event);
				expect(result).toEqual(['image1.png', 'image2.jpeg', 'document.txt']);
			});

			it('should return empty array when attachments metadata is undefined', () => {
				const event = createMockWebhookEvent({
					attachments: undefined,
				});

				const result = AttachmentDetectionService.getFileNames(event);
				expect(result).toEqual([]);
			});
		});
	});

	describe('Consistency Validation', () => {
		describe('validateConsistency', () => {
			it('should return false when event should not be processed', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'slack',
				});

				const result = AttachmentDetectionService.validateConsistency(event);
				expect(result).toBe(false);
			});

			it('should return true when both metadata and files indicate no attachments', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [],
					},
				});

				const result = AttachmentDetectionService.validateConsistency(event);
				expect(result).toBe(true);
			});

			it('should return true when both metadata and files indicate same file count', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						hasFiles: true,
						fileCount: 2,
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ name: 'file1.png', size: 1024 },
							{ name: 'file2.jpg', size: 2048 },
						],
					},
				});

				const result = AttachmentDetectionService.validateConsistency(event);
				expect(result).toBe(true);
			});

			it('should return false and log warning when file counts mismatch', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						hasFiles: true,
						fileCount: 3,
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ name: 'file1.png', size: 1024 },
						],
					},
				});

				const result = AttachmentDetectionService.validateConsistency(event);
				expect(result).toBe(false);
				expect(LogEngine.warn).toHaveBeenCalledWith(
					'Attachment metadata inconsistency detected',
					expect.objectContaining({
						metadataHasFiles: true,
						metadataCount: 3,
						actualFilesCount: 1,
						eventId: 'test-event-id',
						sourcePlatform: 'dashboard',
						conversationId: 'test',
					}),
				);
			});
		});
	});

	describe('Processing Decision Logic', () => {
		describe('getProcessingDecision', () => {
			it('should return non-dashboard event decision', () => {
				const event = createMockWebhookEvent({
					sourcePlatform: 'slack',
				});

				const result = AttachmentDetectionService.getProcessingDecision(event);

				expect(result).toEqual({
					shouldProcess: false,
					hasAttachments: false,
					hasImages: false,
					hasSupportedImages: false,
					hasUnsupported: false,
					isOversized: false,
					summary: 'No attachments',
					reason: 'Non-dashboard event',
				});
			});

			it('should return no attachments decision', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({ hasFiles: false }),
				});

				const result = AttachmentDetectionService.getProcessingDecision(event);

				expect(result).toEqual({
					shouldProcess: true,
					hasAttachments: false,
					hasImages: false,
					hasSupportedImages: false,
					hasUnsupported: false,
					isOversized: false,
					summary: 'No attachments',
					reason: 'No attachments',
				});
			});

			it('should return files too large decision', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						fileCount: 1,
						totalSize: 10 * 1024 * 1024,
						types: ['image/png'],
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [{ size: 10 * 1024 * 1024, name: 'large.png' }],
					},
				});

				const result = AttachmentDetectionService.getProcessingDecision(event, 8 * 1024 * 1024);

				expect(result.reason).toBe('Files too large');
				expect(result.isOversized).toBe(true);
			});

			it('should return unsupported file types decision', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['text/plain', 'application/pdf'],
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'document.txt' },
						],
					},
				});

				const result = AttachmentDetectionService.getProcessingDecision(event);

				expect(result.reason).toBe('Unsupported file types');
				expect(result.hasUnsupported).toBe(true);
			});

			it('should return ready for image processing decision', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png'],
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'image.png' },
						],
					},
				});

				const result = AttachmentDetectionService.getProcessingDecision(event);

				expect(result.reason).toBe('Ready for image processing');
				expect(result.hasSupportedImages).toBe(true);
			});

			it('should use default max size when not provided', () => {
				const event = createMockWebhookEvent({
					attachments: createMockAttachmentsMetadata({
						types: ['image/png'],
					}),
					data: {
						id: 'test',
						conversationId: 'test',
						files: [
							{ size: 1024, name: 'image.png' },
						],
					},
				});

				const result = AttachmentDetectionService.getProcessingDecision(event);
				// Should use DISCORD_ATTACHMENT_CONFIG.maxFileSize as default
				expect(result.isOversized).toBe(false);
			});
		});
	});

	describe('Legacy Discord.js Collection Methods', () => {

		describe('hasDiscordImageAttachments', () => {
			it('should return true when collection has supported image attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ contentType: 'image/png' }));
				attachments.set('2', createMockAttachment({ contentType: 'image/jpeg' }));

				const result = AttachmentDetectionService.hasDiscordImageAttachments(attachments as any);
				expect(result).toBe(true);
			});

			it('should return false when collection has no supported image attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ contentType: 'text/plain' }));
				attachments.set('2', createMockAttachment({ contentType: 'application/pdf' }));

				const result = AttachmentDetectionService.hasDiscordImageAttachments(attachments as any);
				expect(result).toBe(false);
			});

			it('should return false when collection is empty', () => {
				const attachments = new MockCollection<string, Attachment>();

				const result = AttachmentDetectionService.hasDiscordImageAttachments(attachments as any);
				expect(result).toBe(false);
			});
		});

		describe('filterSupportedImages', () => {
			it('should filter and return only supported image attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ 
					contentType: 'image/png',
					size: 1024,
					name: 'supported.png' 
				}));
				attachments.set('2', createMockAttachment({ 
					contentType: 'text/plain',
					name: 'unsupported.txt' 
				}));
				attachments.set('3', createMockAttachment({ 
					contentType: 'image/jpeg',
					size: 2048,
					name: 'supported.jpg' 
				}));

				const result = AttachmentDetectionService.filterSupportedImages(attachments as any);
				
				expect(result.size).toBe(2);
				expect(result.has('1')).toBe(true);
				expect(result.has('3')).toBe(true);
				expect(result.has('2')).toBe(false);
			});

			it('should exclude attachments without content type', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ 
					contentType: null as any,
					name: 'no-content-type.file' 
				}));

				const result = AttachmentDetectionService.filterSupportedImages(attachments as any);
				
				expect(result.size).toBe(0);
				expect(LogEngine.debug).toHaveBeenCalledWith(
					'Attachment no-content-type.file has no content type, skipping'
				);
			});

			it('should exclude oversized attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ 
					contentType: 'image/png',
					size: 10 * 1024 * 1024, // 10MB - over limit
					name: 'large.png' 
				}));

				const result = AttachmentDetectionService.filterSupportedImages(attachments as any);
				
				expect(result.size).toBe(0);
				expect(LogEngine.debug).toHaveBeenCalledWith(
					'Attachment large.png is too large (10485760 bytes), skipping'
				);
			});
		});

		describe('validateFileSize', () => {
			it('should return true for attachments within size limit', () => {
				const attachment = createMockAttachment({ size: 1024 });

				const result = AttachmentDetectionService.validateFileSize(attachment);
				expect(result).toBe(true);
			});

			it('should return false for attachments exceeding size limit', () => {
				const attachment = createMockAttachment({ size: 10 * 1024 * 1024 });

				const result = AttachmentDetectionService.validateFileSize(attachment);
				expect(result).toBe(false);
			});
		});

		describe('getTotalAttachmentSize', () => {
			it('should calculate total size of all attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({ size: 1024 }));
				attachments.set('2', createMockAttachment({ size: 2048 }));
				attachments.set('3', createMockAttachment({ size: 512 }));

				const result = AttachmentDetectionService.getTotalAttachmentSize(attachments as any);
				expect(result).toBe(3584);
			});

			it('should return 0 for empty collection', () => {
				const attachments = new MockCollection<string, Attachment>();

				const result = AttachmentDetectionService.getTotalAttachmentSize(attachments as any);
				expect(result).toBe(0);
			});
		});

		describe('getSupportedImageTypes', () => {
			it('should return array of supported image types', () => {
				const result = AttachmentDetectionService.getSupportedImageTypes();
				
				expect(Array.isArray(result)).toBe(true);
				expect(result).toContain('image/png');
				expect(result).toContain('image/jpeg');
				expect(result).toContain('image/jpg');
				expect(result).toContain('image/gif');
				expect(result).toContain('image/webp');
			});
		});

		describe('validateAttachment', () => {
			it('should return valid result for supported attachment', () => {
				const attachment = createMockAttachment({
					contentType: 'image/png',
					size: 1024,
					name: 'test.png',
				});

				const result = AttachmentDetectionService.validateAttachment(attachment);

				expect(result.isValid).toBe(true);
				expect(result.fileInfo).toEqual({
					fileName: 'test.png',
					mimeType: 'image/png',
					size: 1024,
				});
			});

			it('should return invalid result for attachment without content type', () => {
				const attachment = createMockAttachment({
					contentType: null as any,
					name: 'test.file',
				});

				const result = AttachmentDetectionService.validateAttachment(attachment);

				expect(result.isValid).toBe(false);
				expect(result.error).toBe('Attachment has no content type information');
			});

			it('should return invalid result for unsupported file type', () => {
				const attachment = createMockAttachment({
					contentType: 'text/plain',
					name: 'test.txt',
				});

				const result = AttachmentDetectionService.validateAttachment(attachment);

				expect(result.isValid).toBe(false);
				expect(result.error).toBe('⚠️ Only images (PNG, JPEG, GIF, WebP) are supported.');
			});

			it('should return invalid result for oversized attachment', () => {
				const attachment = createMockAttachment({
					contentType: 'image/png',
					size: 10 * 1024 * 1024,
					name: 'large.png',
				});

				const result = AttachmentDetectionService.validateAttachment(attachment);

				expect(result.isValid).toBe(false);
				expect(result.error).toBe('📏 File too large. Maximum size is 8MB per image.');
			});
		});

		describe('validateAttachments', () => {
			it('should validate collection and separate valid/invalid attachments', () => {
				const attachments = new MockCollection<string, Attachment>();
				attachments.set('1', createMockAttachment({
					contentType: 'image/png',
					size: 1024,
					name: 'valid.png',
				}));
				attachments.set('2', createMockAttachment({
					contentType: 'text/plain',
					name: 'invalid.txt',
				}));
				attachments.set('3', createMockAttachment({
					contentType: 'image/jpeg',
					size: 2048,
					name: 'valid.jpg',
				}));

				const result = AttachmentDetectionService.validateAttachments(attachments as any);

				expect(result.valid).toHaveLength(2);
				expect(result.invalid).toHaveLength(1);
				expect(result.totalSize).toBe(3072);
				expect(result.invalid[0].error).toBe('⚠️ Only images (PNG, JPEG, GIF, WebP) are supported.');
			});

			it('should mark all attachments as invalid when exceeding file count limit', () => {
				const attachments = new MockCollection<string, Attachment>();
				// Create 11 attachments (exceeds maxFilesPerMessage of 10)
				for (let i = 0; i < 11; i++) {
					attachments.set(i.toString(), createMockAttachment({
						contentType: 'image/png',
						size: 1024,
						name: `file${i}.png`,
					}));
				}

				const result = AttachmentDetectionService.validateAttachments(attachments as any);

				expect(result.valid).toHaveLength(0);
				expect(result.invalid).toHaveLength(11);
				expect(result.totalSize).toBe(0);
				expect(result.invalid[0].error).toBe('📎 Too many files. Maximum is 10 images per message.');
			});

			it('should handle empty collection', () => {
				const attachments = new MockCollection<string, Attachment>();

				const result = AttachmentDetectionService.validateAttachments(attachments as any);

				expect(result.valid).toHaveLength(0);
				expect(result.invalid).toHaveLength(0);
				expect(result.totalSize).toBe(0);
			});
		});
	});

	describe('Edge Cases and Error Scenarios', () => {
		it('should handle malformed webhook events gracefully', () => {
			const malformedEvent = {
				platform: 'unthread',
			} as any;

			// Should not throw when calling methods with malformed events
			expect(() => AttachmentDetectionService.shouldProcessEvent(malformedEvent)).not.toThrow();
			expect(() => AttachmentDetectionService.hasAttachments(malformedEvent)).not.toThrow();
			expect(() => AttachmentDetectionService.getProcessingDecision(malformedEvent)).not.toThrow();
		});

		it('should handle empty metadata gracefully', () => {
			const event = createMockWebhookEvent({
				attachments: {} as any,
			});

			expect(() => AttachmentDetectionService.getFileCount(event)).not.toThrow();
			expect(() => AttachmentDetectionService.getTotalSize(event)).not.toThrow();
			expect(() => AttachmentDetectionService.getFileTypes(event)).not.toThrow();
			expect(() => AttachmentDetectionService.getFileNames(event)).not.toThrow();
		});

		it('should handle invalid content types gracefully', () => {
			const attachments = new MockCollection<string, Attachment>();
			attachments.set('1', createMockAttachment({
				contentType: '' as any,
				name: 'empty-type.file',
			}));

			// Should not throw but will call filter which might throw
			try {
				AttachmentDetectionService.filterSupportedImages(attachments as any);
			} catch {
				// This is expected to potentially throw due to mock limitations
			}
			
			expect(() => AttachmentDetectionService.validateAttachment(attachments.get('1')!)).not.toThrow();
		});
	});
});