import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

// AWS RDS certificates are signed by Amazon's own root CAs, which Node doesn't trust by default.
const RDS_CA_BUNDLE = new URL('../../certs/rds-global-bundle.pem', import.meta.url);

function poolConfig(databaseUrl: string | undefined): PoolConfig {
  if (!databaseUrl?.includes('sslmode=') || databaseUrl.includes('sslmode=disable')) {
    return { connectionString: databaseUrl };
  }
  // pg lets `sslmode` in the URL override the `ssl` option, so it's removed here.
  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: { ca: [...rootCertificates, readFileSync(RDS_CA_BUNDLE, 'utf8')] },
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg(poolConfig(process.env.DATABASE_URL)) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
