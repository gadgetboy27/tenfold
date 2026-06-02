-- Add name column to campaigns table
ALTER TABLE campaigns
ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled Campaign';

-- Update existing campaigns (if any) to have a default name
UPDATE campaigns
SET name = COALESCE(name, 'Campaign ' || TO_CHAR(created_at, 'YYYY-MM-DD HH:MM'))
WHERE name IS NULL OR name = '';
