import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { StageConfig } from '../bin/app';

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LAMBDAS_DIR = path.join(PROJECT_ROOT, 'src', 'lambdas');
const PROJECT_LOCKFILE = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');

interface InfrastructureStackProps extends cdk.StackProps {
  stage: string;
  config: StageConfig;
}

/** DynamoDB + KMS + six per-route Lambdas behind a REST API. */
export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.config.removalPolicy === 'retain'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY;
    const logRetention = retentionDays(props.config.logRetentionDays);

    // Customer-managed key so we can scope encrypt/decrypt per Lambda;
    // see grants below.
    const tableKey = new kms.Key(this, 'TableKey', {
      alias: `alias/exam-items-table-${props.stage}`,
      description: 'Customer-managed key for ExamItems DynamoDB encryption at rest',
      enableKeyRotation: true,
      removalPolicy,
    });

    // Single table:
    //   PK + SK             ITEM#<id> + CURRENT | VERSION#<n>
    //   SubjectStatusIndex  subject + SK   (list by subject, SK=CURRENT)
    //   InverseIndex        SK             (global list, SK=CURRENT; hot
    //                                       partition risk at scale)
    const table = new dynamodb.Table(this, 'ExamItems', {
      tableName: `ExamItems-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: tableKey,
      removalPolicy,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'SubjectStatusIndex',
      partitionKey: { name: 'subject', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'InverseIndex',
      partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // One function per route so IAM stays scoped. arm64 + esbuild.
    const sharedProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      projectRoot: PROJECT_ROOT,
      depsLockFilePath: PROJECT_LOCKFILE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
      },
      environment: {
        USE_DYNAMODB: 'true',
        DYNAMODB_TABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    } satisfies Partial<lambdaNodejs.NodejsFunctionProps>;

    const makeFn = (id: string, route: string) =>
      new lambdaNodejs.NodejsFunction(this, id, {
        ...sharedProps,
        functionName: `exam-items-${route}-${props.stage}`,
        entry: path.join(LAMBDAS_DIR, `${route}.ts`),
        handler: 'handler',
        logGroup: new logs.LogGroup(this, `${id}Logs`, {
          logGroupName: `/aws/lambda/exam-items-${route}-${props.stage}`,
          retention: logRetention,
          removalPolicy,
        }),
      });

    const createItemFn = makeFn('CreateItemFn', 'createItem');
    const getItemFn = makeFn('GetItemFn', 'getItem');
    const updateItemFn = makeFn('UpdateItemFn', 'updateItem');
    const listItemsFn = makeFn('ListItemsFn', 'listItems');
    const createVersionFn = makeFn('CreateVersionFn', 'createVersion');
    const getAuditTrailFn = makeFn('GetAuditTrailFn', 'getAuditTrail');

    // grantWriteData doesn't cover TransactWriteItems, so grant it explicitly.
    table.grant(getItemFn, 'dynamodb:GetItem');
    table.grant(listItemsFn, 'dynamodb:Query');
    table.grant(getAuditTrailFn, 'dynamodb:Query');
    table.grant(createItemFn, 'dynamodb:TransactWriteItems');
    table.grant(updateItemFn, 'dynamodb:GetItem', 'dynamodb:TransactWriteItems');
    table.grant(createVersionFn, 'dynamodb:GetItem', 'dynamodb:TransactWriteItems');

    tableKey.grantDecrypt(getItemFn);
    tableKey.grantDecrypt(listItemsFn);
    tableKey.grantDecrypt(getAuditTrailFn);
    tableKey.grantEncrypt(createItemFn);
    tableKey.grantEncryptDecrypt(updateItemFn);
    tableKey.grantEncryptDecrypt(createVersionFn);

    // REST over HTTP API for native request validators, usage plans, and WAF.
    const accessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/exam-items-${props.stage}`,
      retention: logRetention,
      removalPolicy,
    });

    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `exam-items-${props.stage}`,
      deployOptions: {
        stageName: props.stage,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // Don't log bodies; correctAnswer must not reach CloudWatch.
        dataTraceEnabled: false,
        metricsEnabled: true,
        throttlingRateLimit: props.config.apiThrottle.rateLimit,
        throttlingBurstLimit: props.config.apiThrottle.burstLimit,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
    });

    const apiRoot = api.root.addResource('api');
    const items = apiRoot.addResource('items');
    items.addMethod('POST', new apigateway.LambdaIntegration(createItemFn));
    items.addMethod('GET', new apigateway.LambdaIntegration(listItemsFn));

    const itemById = items.addResource('{id}');
    itemById.addMethod('GET', new apigateway.LambdaIntegration(getItemFn));
    itemById.addMethod('PUT', new apigateway.LambdaIntegration(updateItemFn));

    const versions = itemById.addResource('versions');
    versions.addMethod('POST', new apigateway.LambdaIntegration(createVersionFn));

    const audit = itemById.addResource('audit');
    audit.addMethod('GET', new apigateway.LambdaIntegration(getAuditTrailFn));

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
  }
}

function retentionDays(days: number): logs.RetentionDays {
  // RetentionDays is an enum, not an int; map the values we accept.
  const map: Record<number, logs.RetentionDays> = {
    7: logs.RetentionDays.ONE_WEEK,
    14: logs.RetentionDays.TWO_WEEKS,
    30: logs.RetentionDays.ONE_MONTH,
    60: logs.RetentionDays.TWO_MONTHS,
    90: logs.RetentionDays.THREE_MONTHS,
    180: logs.RetentionDays.SIX_MONTHS,
    365: logs.RetentionDays.ONE_YEAR,
  };
  const value = map[days];
  if (!value) throw new Error(`Unsupported log retention: ${days} days`);
  return value;
}
