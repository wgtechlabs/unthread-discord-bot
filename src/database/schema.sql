-- Initialize Unthread Discord Bot Database
-- This script sets up the basic schema for the 3-layer storage architecture
-- Standardized to match Telegram bot schema patterns

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tickets table - Maps individual tickets/conversations between platforms
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_message_id VARCHAR(50) NOT NULL UNIQUE,  -- discord_thread_id
    conversation_id VARCHAR(255) NOT NULL,
    ticket_id VARCHAR(255),
    friendly_id VARCHAR(100) NOT NULL,
    platform_chat_id VARCHAR(50) NOT NULL,  -- discord_channel_id
    platform_user_id VARCHAR(50) NOT NULL,  -- discord user id
    ticket_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User states table - State tracking for conversations
CREATE TABLE IF NOT EXISTS user_states (
    platform_user_id VARCHAR(50) PRIMARY KEY,  -- discord user id
    state_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers table - Unified customer storage
CREATE TABLE IF NOT EXISTS customers (
    discord_id VARCHAR(50) PRIMARY KEY,  -- discord user id
    unthread_customer_id VARCHAR(255),  -- unthread customer id
    email VARCHAR(255),
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    customer_data JSONB,  -- additional customer data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage_cache table for L3 persistent cache
CREATE TABLE IF NOT EXISTS storage_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thread ticket mappings table - Maps Discord threads to Unthread tickets
CREATE TABLE IF NOT EXISTS thread_ticket_mappings (
    discord_thread_id VARCHAR(50) PRIMARY KEY,  -- discord thread id
    unthread_ticket_id VARCHAR(255) NOT NULL,
    discord_channel_id VARCHAR(50),  -- discord channel id
    customer_id VARCHAR(255),  -- reference to customers table
    status VARCHAR(20) DEFAULT 'active',  -- active, closed, archived
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_platform_message_id ON tickets(platform_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation_id ON tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tickets_platform_chat_id ON tickets(platform_chat_id);
CREATE INDEX IF NOT EXISTS idx_customers_unthread_customer_id ON customers(unthread_customer_id);
-- Index for efficient expiration cleanup
CREATE INDEX IF NOT EXISTS idx_storage_cache_expires_at ON storage_cache(expires_at);
-- Index for thread ticket mappings
CREATE INDEX IF NOT EXISTS idx_thread_ticket_mappings_unthread_ticket_id ON thread_ticket_mappings(unthread_ticket_id);
CREATE INDEX IF NOT EXISTS idx_thread_ticket_mappings_customer_id ON thread_ticket_mappings(customer_id);

-- Trigger for automatic updated_at timestamp (reuses existing function)
CREATE TRIGGER trigger_storage_cache_updated_at
    BEFORE UPDATE ON storage_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at timestamps
CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_states_updated_at
    BEFORE UPDATE ON user_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storage_cache_updated_at BEFORE UPDATE ON storage_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thread_ticket_mappings_updated_at
    BEFORE UPDATE ON thread_ticket_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM storage_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;