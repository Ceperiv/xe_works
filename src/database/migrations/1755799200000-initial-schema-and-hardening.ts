import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchemaAndHardening1755799200000 implements MigrationInterface {
  name = 'InitialSchemaAndHardening1755799200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS publishers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_publishers_domain UNIQUE (domain)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        "bundleId" VARCHAR(255) NOT NULL,
        marketplace VARCHAR(32) NOT NULL,
        name VARCHAR(255),
        "publisherId" INT,
        "publisherDomain" VARCHAR(255),
        "marketplaceUrl" VARCHAR(1024),
        status VARCHAR(64) NOT NULL DEFAULT 'pending',
        "lastMarketplaceCheckAt" TIMESTAMPTZ,
        "nextMarketplaceCheckAt" TIMESTAMPTZ,
        "lastAdsTxtCheckAt" TIMESTAMPTZ,
        "nextAdsTxtCheckAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_applications_bundle_marketplace UNIQUE ("bundleId", marketplace),
        CONSTRAINT fk_applications_publisher FOREIGN KEY ("publisherId") REFERENCES publishers(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS app_ads_txt (
        id SERIAL PRIMARY KEY,
        "applicationId" INT NOT NULL,
        domain VARCHAR(255) NOT NULL,
        content TEXT,
        "contentHash" VARCHAR(128),
        "lastHttpStatus" INT,
        "lastFetchedAt" TIMESTAMPTZ,
        "lastChangedAt" TIMESTAMPTZ,
        "lastErrorCode" VARCHAR(64),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_app_ads_txt_application UNIQUE ("applicationId"),
        CONSTRAINT fk_app_ads_txt_application FOREIGN KEY ("applicationId") REFERENCES applications(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scraping_jobs (
        id SERIAL PRIMARY KEY,
        "applicationId" INT NOT NULL,
        type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        "scheduledAt" TIMESTAMPTZ NOT NULL,
        "startedAt" TIMESTAMPTZ,
        "finishedAt" TIMESTAMPTZ,
        error TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_scraping_jobs_application_type UNIQUE ("applicationId", type),
        CONSTRAINT fk_scraping_jobs_application FOREIGN KEY ("applicationId") REFERENCES applications(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`ALTER TABLE app_ads_txt ADD COLUMN IF NOT EXISTS "lastHttpStatus" INT`);
    await queryRunner.query(`ALTER TABLE app_ads_txt ADD COLUMN IF NOT EXISTS "lastFetchedAt" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE app_ads_txt ADD COLUMN IF NOT EXISTS "lastErrorCode" VARCHAR(64)`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'app_ads_txt' AND column_name = 'httpStatus'
        ) THEN
          EXECUTE '
            UPDATE app_ads_txt
            SET
              "lastHttpStatus" = COALESCE("lastHttpStatus", "httpStatus"),
              "lastFetchedAt" = COALESCE("lastFetchedAt", "fetchedAt"),
              "lastErrorCode" = COALESCE("lastErrorCode", "errorCode")
          ';
        END IF;
      END $$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_publishers_name ON publishers(name)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_applications_next_marketplace_check ON applications("nextMarketplaceCheckAt", id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_applications_next_ads_txt_check ON applications("nextAdsTxtCheckAt", id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_app_ads_txt_last_fetched_at ON app_ads_txt("lastFetchedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_app_ads_txt_last_changed_at ON app_ads_txt("lastChangedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_scraping_jobs_scheduled_at ON scraping_jobs("scheduledAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_scraping_jobs_scheduled_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_scraping_jobs_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_app_ads_txt_last_changed_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_app_ads_txt_last_fetched_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_next_ads_txt_check`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_next_marketplace_check`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_publishers_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS scraping_jobs`);
    await queryRunner.query(`DROP TABLE IF EXISTS app_ads_txt`);
    await queryRunner.query(`DROP TABLE IF EXISTS applications`);
    await queryRunner.query(`DROP TABLE IF EXISTS publishers`);
  }
}
