-- AlterEnum
-- Adds the event types produced by the expense update/delete flows and the
-- existing silent group mutations (group rename, member removal).
ALTER TYPE "ActivityType" ADD VALUE 'EXPENSE_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'EXPENSE_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'GROUP_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'MEMBER_REMOVED';