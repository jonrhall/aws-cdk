import * as path from 'path';
import * as fs from 'fs-extra';
import { Default } from '../lib/default';
import { AWS_REGIONS, AWS_SERVICES } from './aws-entities';
import {
  APPMESH_ECR_ACCOUNTS, AWS_CDK_METADATA, AWS_OLDER_REGIONS, CLOUDWATCH_LAMBDA_INSIGHTS_ARNS, DLC_REPOSITORY_ACCOUNTS,
  ELBV2_ACCOUNTS, FIREHOSE_CIDR_BLOCKS, PARTITION_MAP, ROUTE_53_BUCKET_WEBSITE_ZONE_IDS,
} from './fact-tables';

async function main(): Promise<void> {
  checkRegions(APPMESH_ECR_ACCOUNTS);
  checkRegions(DLC_REPOSITORY_ACCOUNTS);
  checkRegions(ELBV2_ACCOUNTS);
  checkRegions(FIREHOSE_CIDR_BLOCKS);
  checkRegions(ROUTE_53_BUCKET_WEBSITE_ZONE_IDS);
  checkRegionsSubMap(CLOUDWATCH_LAMBDA_INSIGHTS_ARNS);

  const lines = [
    "import { Fact, FactName } from './fact';",
    '',
    '/* eslint-disable quote-props */',
    '/* eslint-disable max-len */',
    '',
    '/**',
    ' * Built-in regional information, re-generated by `npm run build`.',
    ' *',
    ` * @generated ${new Date().toISOString()}`,
    ' */',
    'export class BuiltIns {',
    '  /**',
    '   * Registers all the built in regional data in the RegionInfo database.',
    '   */',
    '  public static register(): void {',
  ];

  const defaultMap = 'default';

  for (const region of AWS_REGIONS) {
    let partition = PARTITION_MAP[defaultMap].partition;
    let domainSuffix = PARTITION_MAP[defaultMap].domainSuffix;

    for (const key in PARTITION_MAP) {
      if (region.startsWith(key)) {
        partition = PARTITION_MAP[key].partition;
        domainSuffix = PARTITION_MAP[key].domainSuffix;
      }
    }

    registerFact(region, 'PARTITION', partition);
    registerFact(region, 'DOMAIN_SUFFIX', domainSuffix);

    registerFact(region, 'CDK_METADATA_RESOURCE_AVAILABLE', AWS_CDK_METADATA.has(region) ? 'YES' : 'NO');

    registerFact(region, 'S3_STATIC_WEBSITE_ENDPOINT', AWS_OLDER_REGIONS.has(region)
      ? `s3-website-${region}.${domainSuffix}`
      : `s3-website.${region}.${domainSuffix}`);

    registerFact(region, 'S3_STATIC_WEBSITE_ZONE_53_HOSTED_ZONE_ID', ROUTE_53_BUCKET_WEBSITE_ZONE_IDS[region] || '');

    registerFact(region, 'ELBV2_ACCOUNT', ELBV2_ACCOUNTS[region]);

    registerFact(region, 'DLC_REPOSITORY_ACCOUNT', DLC_REPOSITORY_ACCOUNTS[region]);

    registerFact(region, 'APPMESH_ECR_ACCOUNT', APPMESH_ECR_ACCOUNTS[region]);

    const firehoseCidrBlock = FIREHOSE_CIDR_BLOCKS[region];
    if (firehoseCidrBlock) {
      registerFact(region, 'FIREHOSE_CIDR_BLOCK', `${FIREHOSE_CIDR_BLOCKS[region]}/27`);
    }

    const vpcEndpointServiceNamePrefix = `${domainSuffix.split('.').reverse().join('.')}.vpce`;
    registerFact(region, 'VPC_ENDPOINT_SERVICE_NAME_PREFIX', vpcEndpointServiceNamePrefix);

    for (const service of AWS_SERVICES) {
      registerFact(region, ['servicePrincipal', service], Default.servicePrincipal(service, region, domainSuffix));
    }

    for (const version in CLOUDWATCH_LAMBDA_INSIGHTS_ARNS) {
      registerFact(region, ['cloudwatchLambdaInsightsVersion', version], CLOUDWATCH_LAMBDA_INSIGHTS_ARNS[version][region]);
    }
  }
  lines.push('  }');
  lines.push('');
  lines.push('  private constructor() {}');
  lines.push('}');

  await fs.writeFile(path.resolve(__dirname, '..', 'lib', 'built-ins.generated.ts'), lines.join('\n'));

  function registerFact(region: string, name: string | string[], value: string) {
    const factName = typeof name === 'string' ? name : `${name[0]}(${name.slice(1).map(s => JSON.stringify(s)).join(', ')})`;
    lines.push(`    Fact.register({ region: ${JSON.stringify(region)}, name: FactName.${factName}, value: ${JSON.stringify(value)} });`);
  }
}

/**
 * Verifies that the provided map of region to fact does not contain an entry
 * for a region that was not registered in `AWS_REGIONS`.
 */
function checkRegions(map: Record<string, unknown>) {
  const allRegions = new Set(AWS_REGIONS);
  for (const region of Object.keys(map)) {
    if (!allRegions.has(region)) {
      throw new Error(`Un-registered region fact found: ${region}. Add to AWS_REGIONS list!`);
    }
  }
}

/**
 * Verifies that the provided map of <KEY> to region to fact does not contain an entry
 * for a region that was not registered in `AWS_REGIONS`.
 */
function checkRegionsSubMap(map: Record<string, Record<string, unknown>>) {
  const allRegions = new Set(AWS_REGIONS);
  for (const key of Object.keys(map)) {
    for (const region of Object.keys(map[key])) {
      if (!allRegions.has(region)) {
        throw new Error(`Un-registered region fact found: ${region}. Add to AWS_REGIONS list!`);
      }
    }
  }
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(-1);
});
