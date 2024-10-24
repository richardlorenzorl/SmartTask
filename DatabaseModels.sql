-- Create extension for UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    team_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    roles JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    assignee_id UUID REFERENCES users(user_id),
    project_id UUID REFERENCES projects(project_id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Team memberships
CREATE TABLE team_members (
    team_id UUID REFERENCES teams(team_id),
    user_id UUID REFERENCES users(user_id),
    role VARCHAR(50) NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

-- Task dependencies
CREATE TABLE task_dependencies (
    dependent_task_id UUID REFERENCES tasks(task_id),
    dependency_task_id UUID REFERENCES tasks(task_id),
    PRIMARY KEY (dependent_task_id, dependency_task_id)
);

-- Indexes for performance
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_team_members_user ON team_members(user_id);
