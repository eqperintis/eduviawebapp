/**
 * The database schema, as ordered SQL migrations the app applies to itself
 * on start-up (see migrate.ts). Hostinger's build container has no route to
 * the database, so `prisma migrate deploy` can't run during a deploy.
 *
 * To change the schema: edit prisma/schema.prisma, then append a new entry
 * here with the SQL from
 *   npx prisma migrate diff --from-schema <old schema> --to-schema prisma/schema.prisma --script
 * Never edit an entry that has already shipped.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
-- CreateTable
CREATE TABLE \`User\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`email\` VARCHAR(191) NOT NULL,
    \`passwordHash\` VARCHAR(191) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX \`User_email_key\`(\`email\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`Form\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`name\` VARCHAR(191) NOT NULL,
    \`publicId\` VARCHAR(191) NOT NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
    \`notifyEnabled\` BOOLEAN NOT NULL DEFAULT true,
    \`notifyEmails\` TEXT NULL,
    \`allowedDomains\` TEXT NULL,
    \`redirectUrl\` VARCHAR(191) NOT NULL DEFAULT '',
    \`successTitle\` VARCHAR(191) NOT NULL DEFAULT 'Thank you.',
    \`successMessage\` TEXT NULL,
    \`brandName\` VARCHAR(191) NOT NULL DEFAULT 'Eduvia',
    \`logoText\` VARCHAR(191) NOT NULL DEFAULT 'Q',
    \`accentColor\` VARCHAR(191) NOT NULL DEFAULT '#5EB4FF',
    \`textColor\` VARCHAR(191) NOT NULL DEFAULT '#141A5E',
    \`bgColor\` VARCHAR(191) NOT NULL DEFAULT '#F5F7FC',
    \`fontFamily\` VARCHAR(191) NOT NULL DEFAULT 'Geist',
    \`fields\` TEXT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    UNIQUE INDEX \`Form_publicId_key\`(\`publicId\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`FormSubmission\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`formId\` VARCHAR(191) NOT NULL,
    \`data\` TEXT NOT NULL,
    \`email\` VARCHAR(191) NOT NULL DEFAULT '',
    \`name\` VARCHAR(191) NOT NULL DEFAULT '',
    \`referrer\` VARCHAR(500) NOT NULL DEFAULT '',
    \`ip\` VARCHAR(191) NOT NULL DEFAULT '',
    \`userAgent\` VARCHAR(500) NOT NULL DEFAULT '',
    \`emailOptOutToken\` VARCHAR(191) NULL,
    \`emailOptOutAt\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX \`FormSubmission_emailOptOutToken_key\`(\`emailOptOutToken\`),
    INDEX \`FormSubmission_formId_createdAt_idx\`(\`formId\`, \`createdAt\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`Automation\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`name\` VARCHAR(191) NOT NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'draft',
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`AutomationTrigger\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`automationId\` VARCHAR(191) NOT NULL,
    \`formId\` VARCHAR(191) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX \`AutomationTrigger_formId_idx\`(\`formId\`),
    UNIQUE INDEX \`AutomationTrigger_automationId_formId_key\`(\`automationId\`, \`formId\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`AutomationNode\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`automationId\` VARCHAR(191) NOT NULL,
    \`type\` VARCHAR(191) NOT NULL,
    \`parentId\` VARCHAR(191) NULL,
    \`branch\` VARCHAR(191) NOT NULL DEFAULT 'main',
    \`recipients\` TEXT NULL,
    \`subject\` VARCHAR(191) NULL,
    \`content\` TEXT NULL,
    \`ctaLabel\` VARCHAR(191) NULL,
    \`url\` TEXT NULL,
    \`delayMinutes\` INTEGER NULL,
    \`conditionField\` VARCHAR(191) NULL,
    \`conditionOperator\` VARCHAR(191) NULL,
    \`conditionValue\` TEXT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    INDEX \`AutomationNode_automationId_idx\`(\`automationId\`),
    INDEX \`AutomationNode_parentId_branch_idx\`(\`parentId\`, \`branch\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`AutomationRun\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`automationId\` VARCHAR(191) NOT NULL,
    \`submissionId\` VARCHAR(191) NULL,
    \`email\` VARCHAR(191) NOT NULL,
    \`name\` VARCHAR(191) NOT NULL DEFAULT '',
    \`triggerData\` TEXT NOT NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
    \`currentNodeId\` VARCHAR(191) NULL,
    \`nextRunAt\` DATETIME(3) NULL,
    \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`endedAt\` DATETIME(3) NULL,
    \`updatedAt\` DATETIME(3) NOT NULL,

    INDEX \`AutomationRun_status_nextRunAt_idx\`(\`status\`, \`nextRunAt\`),
    INDEX \`AutomationRun_automationId_startedAt_idx\`(\`automationId\`, \`startedAt\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`AutomationEvent\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`runId\` VARCHAR(191) NOT NULL,
    \`nodeId\` VARCHAR(191) NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'ok',
    \`message\` TEXT NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX \`AutomationEvent_runId_createdAt_idx\`(\`runId\`, \`createdAt\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`RateLimitBucket\` (
    \`key\` VARCHAR(191) NOT NULL,
    \`count\` INTEGER NOT NULL DEFAULT 1,
    \`windowStart\` DATETIME(3) NOT NULL,

    INDEX \`RateLimitBucket_windowStart_idx\`(\`windowStart\`),
    PRIMARY KEY (\`key\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE \`FormSubmission\` ADD CONSTRAINT \`FormSubmission_formId_fkey\` FOREIGN KEY (\`formId\`) REFERENCES \`Form\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationTrigger\` ADD CONSTRAINT \`AutomationTrigger_automationId_fkey\` FOREIGN KEY (\`automationId\`) REFERENCES \`Automation\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationTrigger\` ADD CONSTRAINT \`AutomationTrigger_formId_fkey\` FOREIGN KEY (\`formId\`) REFERENCES \`Form\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationNode\` ADD CONSTRAINT \`AutomationNode_automationId_fkey\` FOREIGN KEY (\`automationId\`) REFERENCES \`Automation\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationNode\` ADD CONSTRAINT \`AutomationNode_parentId_fkey\` FOREIGN KEY (\`parentId\`) REFERENCES \`AutomationNode\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationRun\` ADD CONSTRAINT \`AutomationRun_automationId_fkey\` FOREIGN KEY (\`automationId\`) REFERENCES \`Automation\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationRun\` ADD CONSTRAINT \`AutomationRun_submissionId_fkey\` FOREIGN KEY (\`submissionId\`) REFERENCES \`FormSubmission\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`AutomationEvent\` ADD CONSTRAINT \`AutomationEvent_runId_fkey\` FOREIGN KEY (\`runId\`) REFERENCES \`AutomationRun\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;
`,
  },
  {
    // The app is Eduvia's alone, so forms no longer carry their own brand look.
    id: "0002_drop_form_brand",
    sql: `
ALTER TABLE \`Form\` DROP COLUMN \`accentColor\`,
    DROP COLUMN \`bgColor\`,
    DROP COLUMN \`brandName\`,
    DROP COLUMN \`fontFamily\`,
    DROP COLUMN \`logoText\`,
    DROP COLUMN \`textColor\`;
`,
  },
  {
    // Google account for the Google Sheets automation step.
    id: "0003_google_integration",
    sql: `
CREATE TABLE \`GoogleIntegration\` (
    \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
    \`connectedEmail\` VARCHAR(191) NULL,
    \`refreshToken\` TEXT NULL,
    \`accessToken\` TEXT NULL,
    \`accessTokenExpiresAt\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`,
  },
  {
    // "Forgot password" links.
    id: "0005_password_reset",
    sql: `
CREATE TABLE \`PasswordResetToken\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`userId\` VARCHAR(191) NOT NULL,
    \`tokenHash\` VARCHAR(191) NOT NULL,
    \`expiresAt\` DATETIME(3) NOT NULL,
    \`usedAt\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX \`PasswordResetToken_tokenHash_key\`(\`tokenHash\`),
    INDEX \`PasswordResetToken_userId_createdAt_idx\`(\`userId\`, \`createdAt\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE \`PasswordResetToken\` ADD CONSTRAINT \`PasswordResetToken_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;
`,
  },
  {
    // The page a form lives on, read for its options.
    id: "0006_form_page",
    sql: `
ALTER TABLE \`Form\` ADD COLUMN \`pageUrl\` VARCHAR(500) NULL,
    ADD COLUMN \`pageUrlManual\` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN \`pageScannedAt\` DATETIME(3) NULL;
`,
  },
];
