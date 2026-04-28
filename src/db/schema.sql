-- Social Dispatcher Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Social Accounts (credenciais para FB/IG/WA)
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp')),
  external_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, external_id)
);

-- Posts (artigos enfileirados)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id VARCHAR(255),
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  summary TEXT,
  category VARCHAR(50),
  priority INT DEFAULT 5,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'published', 'failed', 'retry')),
  channels TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job Tracking (BullMQ jobs)
CREATE TABLE IF NOT EXISTS job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  job_id VARCHAR(255) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  error_message TEXT,
  attempt INT DEFAULT 1,
  correlation_id VARCHAR(255),
  duration_ms INT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX job_id (job_id),
  INDEX post_id (post_id),
  INDEX channel (channel)
);

-- Metrics (engagement data)
CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  reactions INT DEFAULT 0,
  shares INT DEFAULT 0,
  comments INT DEFAULT 0,
  saves INT DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX platform (platform),
  INDEX post_id (post_id)
);

-- A/B Tests (Phase 2)
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  test_id VARCHAR(255) UNIQUE,
  variant VARCHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
  headline TEXT NOT NULL,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_job_logs_channel ON job_logs(channel);
CREATE INDEX idx_job_logs_status ON job_logs(status);
CREATE INDEX idx_metrics_platform ON metrics(platform);
