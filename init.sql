-- Initialize Unthread Discord Bot Database
-- This script sets up the basic schema for the 3-layer storage architecture

-- Create customers table for user data persistence
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(50) UNIQUE NOT NULL,
    unthread_customer_id VARCHAR(100),
    email VARCHAR(255),
    username VARCHAR(100),
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create thread_ticket_mappings table for Discord-Unthread relationship tracking
CREATE TABLE IF NOT EXISTS thread_ticket_mappings (
    id SERIAL PRIMARY KEY,
    discord_thread_id VARCHAR(50) UNIQUE NOT NULL,
    unthread_ticket_id VARCHAR(100) NOT NULL,
    discord_channel_id VARCHAR(50),
    customer_id INTEGER REFERENCES customers(id),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync_at TIMESTAMP WITH TIME ZONE
);

-- Create storage_cache table for L3 persistent cache
CREATE TABLE IF NOT EXISTS storage_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(500) UNIQUE NOT NULL,
    data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_discord_id ON customers(discord_id);
CREATE INDEX IF NOT EXISTS idx_customers_unthread_id ON customers(unthread_customer_id);
CREATE INDEX IF NOT EXISTS idx_thread_mappings_discord_thread ON thread_ticket_mappings(discord_thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_mappings_unthread_ticket ON thread_ticket_mappings(unthread_ticket_id);
CREATE INDEX IF NOT EXISTS idx_thread_mappings_channel ON thread_ticket_mappings(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_storage_cache_key ON storage_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_storage_cache_expires ON storage_cache(expires_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thread_mappings_updated_at BEFORE UPDATE ON thread_ticket_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storage_cache_updated_at BEFORE UPDATE ON storage_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM storage_cache WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;