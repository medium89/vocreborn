-- Record community creation as a distinct debit in the economy ledger.
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'COMMUNITY_CREATION';
