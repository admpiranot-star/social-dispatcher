-- Table for storing social account configurations and Meta API tokens
CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL, -- 'facebook', 'instagram', 'whatsapp'
    platform_user_id VARCHAR(255) UNIQUE NOT NULL, -- User ID on the respective platform
    access_token TEXT NOT NULL, -- Encrypted Meta API access token
    token_expires_at TIMESTAMP WITH TIME ZONE,
    refresh_token TEXT, -- For platforms that support refresh tokens
    app_id VARCHAR(255),
    app_secret TEXT,
    config JSONB, -- Additional platform-specific configuration (e.g., page_id for Facebook, phone_number_id for WhatsApp)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for storing information about dispatched posts
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    content TEXT,
    media_url TEXT[], -- Array of URLs for images/videos
    scheduled_at TIMESTAMP WITH TIME ZONE,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL, -- 'pending', 'dispatched', 'failed', 'scheduled'
    platform_post_id VARCHAR(255), -- ID returned by the social platform
    error_message TEXT,
    ab_test_id UUID, -- Foreign key to ab_tests table if part of a test
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for managing A/B tests
CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL, -- 'draft', 'active', 'completed', 'cancelled'
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    config JSONB, -- JSON configuration for the A/B test variants
    results JSONB, -- JSON to store test results
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookup of posts by social account and status
CREATE INDEX IF NOT EXISTS idx_posts_social_account_id_status ON posts (social_account_id, status);

-- Index for faster lookup of social accounts by platform
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts (platform);

-- =====================================================================
-- PHASE 2: AGENTE INTELIGENTE - Tabelas para Scheduling Dinâmico
-- =====================================================================

-- Table for storing real-time engagement events from Meta webhooks
CREATE TABLE IF NOT EXISTS engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'like', 'comment', 'share', 'impression', 'click'
    event_external_id VARCHAR(255) UNIQUE, -- External ID from Meta for deduplication
    metric_value INTEGER DEFAULT 1, -- Number of likes, shares, etc
    metadata JSONB, -- Additional data from Meta webhook
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for managing dynamic queue state and scheduling
CREATE TABLE IF NOT EXISTS queue_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL, -- 'facebook', 'instagram', 'whatsapp', 'tiktok', 'twitter'
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When post should go out
    queue_position INTEGER, -- Current position in queue (1=next, 2=after next, etc)
    priority_score FLOAT DEFAULT 5.0, -- Priority used for sorting (higher=more urgent)
    engagement_rate FLOAT DEFAULT 0.0, -- Current engagement % of previous post in category
    is_story BOOLEAN DEFAULT FALSE, -- Whether this is an Instagram story (LIFO)
    version INTEGER DEFAULT 1, -- Optimistic locking for race conditions
    reprioritized_count INTEGER DEFAULT 0,
    last_reprioritized_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for auditing agent reprioritization decisions
CREATE TABLE IF NOT EXISTS reprioritization_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    old_scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    new_scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    old_queue_position INTEGER,
    new_queue_position INTEGER,
    reason VARCHAR(255) NOT NULL, -- 'breaking_news', 'high_engagement', 'category_trending', 'manual_override'
    agent_decision JSONB, -- Full decision object from council (architect vote, strategist vote, operator vote)
    triggered_by VARCHAR(50), -- 'system', 'user', 'webhook'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking account discovery and network mapping
CREATE TABLE IF NOT EXISTS social_accounts_extended (
    id UUID PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
    account_name VARCHAR(255) NOT NULL, -- Display name (e.g., "PiraNOT News", "PiraNOT Tech")
    follower_count INTEGER DEFAULT 0,
    category_focus VARCHAR(50), -- 'main', 'politics', 'tech', 'entertainment', 'regional', 'lotteries'
    is_main BOOLEAN DEFAULT FALSE, -- Whether this is the main account
    distribution_weight FLOAT DEFAULT 1.0, -- How much priority in distribution (0.5=half priority)
    webhook_verified BOOLEAN DEFAULT FALSE, -- Whether Meta webhook is confirmed
    last_engagement_check TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_engagement_events_post_id ON engagement_events (post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_social_account_id ON engagement_events (social_account_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_received_at ON engagement_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_events_event_type ON engagement_events (event_type);

CREATE INDEX IF NOT EXISTS idx_queue_state_post_id ON queue_state (post_id);
CREATE INDEX IF NOT EXISTS idx_queue_state_channel ON queue_state (channel);
CREATE INDEX IF NOT EXISTS idx_queue_state_scheduled_at ON queue_state (scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_state_priority_score ON queue_state (priority_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_state_post_channel ON queue_state (post_id, channel);

CREATE INDEX IF NOT EXISTS idx_reprioritization_log_post_id ON reprioritization_log (post_id);
CREATE INDEX IF NOT EXISTS idx_reprioritization_log_created_at ON reprioritization_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reprioritization_log_reason ON reprioritization_log (reason);

CREATE INDEX IF NOT EXISTS idx_social_accounts_extended_category_focus ON social_accounts_extended (category_focus);
CREATE INDEX IF NOT EXISTS idx_social_accounts_extended_is_main ON social_accounts_extended (is_main);

-- =====================================================================
-- Engagement Reciler: métricas de posts e páginas para o loop MEDIR → APRENDER
-- =====================================================================

CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_post_id VARCHAR(255) NOT NULL,
  page_id VARCHAR(255) NOT NULL,
  page_name VARCHAR(255),
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform_post_id, fetched_at::date)
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_page_id ON post_metrics (page_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_fetched_at ON post_metrics (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_metrics_engagement ON post_metrics (engagement_rate DESC);

CREATE TABLE IF NOT EXISTS page_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id VARCHAR(255) NOT NULL,
  page_name VARCHAR(255),
  followers INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  post_impressions INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, fetched_at::date)
);

CREATE INDEX IF NOT EXISTS idx_page_metrics_page_id ON page_metrics (page_id);
CREATE INDEX IF NOT EXISTS idx_page_metrics_fetched_at ON page_metrics (fetched_at DESC);
