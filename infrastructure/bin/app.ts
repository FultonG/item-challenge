#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';

export interface StageConfig {
  logRetentionDays: number;
  pointInTimeRecovery: boolean;
  deletionProtection: boolean;
  removalPolicy: 'retain' | 'destroy';
  apiThrottle: { rateLimit: number; burstLimit: number };
}

// Stage selection: `cdk synth -c stage=prod`. Defaults to dev so a
// default-shaped command is safe for local synth.
const app = new cdk.App();
const stage = (app.node.tryGetContext('stage') as string) ?? 'dev';
const stages = app.node.tryGetContext('stages') as Record<string, StageConfig> | undefined;
if (!stages?.[stage]) {
  throw new Error(`Unknown stage "${stage}". Add it under context.stages in cdk.json.`);
}

new InfrastructureStack(app, `ExamItems-${stage}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  stage,
  config: stages[stage],
});

cdk.Tags.of(app).add('project', 'exam-items');
cdk.Tags.of(app).add('stage', stage);
