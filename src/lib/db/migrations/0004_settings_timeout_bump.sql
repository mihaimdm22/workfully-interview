-- Bump the singleton's evaluation timeout from 60s → 120s.
-- The 60s seed in 0003 was clipping cold-start screenings (Vercel function
-- spin-up + OpenRouter routing + Claude Haiku structured-object streaming)
-- before the AI returned. 120s is still inside the 180s UI cap and the 300s
-- Vercel function ceiling.
--
-- Guarded so a user who already tuned the slider keeps their value — only
-- rows still at the original 60000 default are touched.
UPDATE "app_settings"
SET "timeout_ms" = 120000
WHERE "id" = 'singleton' AND "timeout_ms" = 60000;
