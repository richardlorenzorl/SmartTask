-- Calendar provider connections
CREATE TABLE user_calendars (
    calendar_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    provider VARCHAR(50) NOT NULL,
    provider_calendar_id VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    time_zone VARCHAR(50) DEFAULT 'UTC',
    sync_enabled BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Calendar events
CREATE TABLE calendar_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255),
    attendees JSONB DEFAULT '[]',
    external_ids JSONB DEFAULT '[]',
    recurrence_rule VARCHAR(255),
    status VARCHAR(50) DEFAULT 'confirmed',
    is_all_day BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User calendar preferences
CREATE TABLE calendar_preferences (
    user_id UUID REFERENCES users(user_id) PRIMARY KEY,
    work_start_hour INTEGER DEFAULT 9,
    work_end_hour INTEGER DEFAULT 17,
    work_days INTEGER[] DEFAULT '{1,2,3,4,5}'::INTEGER[], -- 0 = Sunday, 1 = Monday, etc.
    minimum_meeting_duration INTEGER DEFAULT 30,
    preferred_meeting_times JSONB DEFAULT '[]',
    break_preferences JSONB DEFAULT '{}',
    time_zone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_calendar_events_user_time ON calendar_events(user_id, start_time, end_time);
CREATE INDEX idx_calendar_events_status ON calendar_events(status);
CREATE INDEX idx_user_calendars_user ON user_calendars(user_id);
CREATE INDEX idx_calendar_events_external ON calendar_events USING gin(external_ids);
