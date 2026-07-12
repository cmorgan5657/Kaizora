-- Seed credit_action_costs with the current app action keys.
-- Run this in your Supabase SQL editor.

create table if not exists public.credit_action_costs (
  id text not null,
  action text not null,
  credits integer not null,
  note text null,
  icon text null,
  sort_order integer null default 0,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint credit_action_costs_pkey primary key (id)
) tablespace pg_default;

delete from public.credit_action_costs;

insert into public.credit_action_costs (
  id,
  action,
  credits,
  note,
  icon,
  sort_order
)
values
  ('decision_layer_image', 'decision_layer_image', 10, 'Decision Layer — Image Analysis', 'Image', 1),
  ('decision_layer_video', 'decision_layer_video', 16, 'Decision Layer — Video Analysis', 'Video', 2),
  ('decision_layer_text', 'decision_layer_text', 6, 'Decision Layer — Text Analysis', 'BookOpen', 3),
  ('decision_layer_audio', 'decision_layer_audio', 10, 'Decision Layer — Audio Analysis', 'Music', 4),
  ('remix_image', 'remix_image', 20, 'Remix — Image Generation', 'Image', 5),
  ('remix_audio', 'remix_audio', 24, 'Remix — Audio Generation', 'Music', 6),
  ('remix_video_5s', 'remix_video_5s', 30, 'Remix — Video Generation (5s)', 'Video', 7),
  ('remix_video_10s', 'remix_video_10s', 50, 'Remix — Video Generation (10s)', 'Video', 8);
