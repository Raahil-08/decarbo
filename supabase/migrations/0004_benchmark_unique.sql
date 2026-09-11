-- Add unique constraint on benchmarks (industry, metric) for idempotent seeding
alter table benchmarks drop constraint if exists benchmarks_industry_metric_key;
alter table benchmarks add constraint benchmarks_industry_metric_key unique (industry, metric);
