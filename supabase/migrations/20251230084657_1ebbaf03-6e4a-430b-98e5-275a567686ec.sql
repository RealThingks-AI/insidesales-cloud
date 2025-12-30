-- Create table_column_preferences table for storing user column preferences
CREATE TABLE public.table_column_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_name TEXT NOT NULL,
  column_config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, module_name)
);

-- Enable RLS
ALTER TABLE public.table_column_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own column preferences"
ON public.table_column_preferences
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own column preferences"
ON public.table_column_preferences
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own column preferences"
ON public.table_column_preferences
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own column preferences"
ON public.table_column_preferences
FOR DELETE
USING (user_id = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_table_column_preferences_updated_at
BEFORE UPDATE ON public.table_column_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();