import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './constructs/network';
import { EcsEc2Batch } from './constructs/ecs-ec2-batch';
import { EcsFargateBatch } from './constructs/ecs-fargate-batch';

export class WorkshopBatchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const network = new Network(this, 'Network', {})

    new EcsEc2Batch(this, 'EcsEc2Batch', { vpc: network.vpc })

    new EcsFargateBatch(this, 'EcsFargateBatch', { vpc: network.vpc })

  }
}
