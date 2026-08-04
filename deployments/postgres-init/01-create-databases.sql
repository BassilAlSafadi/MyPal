-- Creates the three MyPal databases on a fresh Postgres volume.
--
-- The split gives each C# service its own database and its own EF migration
-- history. orders and payments deliberately share mypal_orders: that shared
-- database is what keeps an order insert and its wallet debit in one transaction.
--
-- Runs once, via the postgres image's docker-entrypoint-initdb.d hook.

CREATE DATABASE mypal_auth;
CREATE DATABASE mypal_listings;
CREATE DATABASE mypal_orders;

-- Semantic search lives in the listings database and needs pgvector.
\connect mypal_listings
CREATE EXTENSION IF NOT EXISTS vector;
