import { Construct } from 'constructs';
import { Duration, Size, aws_batch as batch } from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import * as path from 'path';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export interface EcsFargateBatchProps {
  vpc: ec2.Vpc

}

export class EcsFargateBatch extends Construct {
  constructor(scope: Construct, id: string, props: EcsFargateBatchProps) {
    super(scope, id);


    const computeEnvironmentFargate = new batch.FargateComputeEnvironment(this, 'ComputeEnvironmentFargate', {
      vpc: props.vpc,
      maxvCpus: 256,
      spot: false,
    })

    new batch.JobQueue(this, 'JobQueueFargate', {
      priority: 1,
      computeEnvironments: [
        {
          computeEnvironment: computeEnvironmentFargate,
          order: 1
        }
      ]
    })

    const containerDefinitionFargate = new batch.EcsFargateContainerDefinition(this, 'ContainerDefinitionFargate', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/single")
      ),
      cpu: 1,
      memory: Size.mebibytes(2048),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'batch-test',
        logRetention: RetentionDays.ONE_DAY
      }),
      fargateCpuArchitecture: ecs.CpuArchitecture.ARM64
    })

    new batch.EcsJobDefinition(this, 'JobDefinitionFargate', {
      container: containerDefinitionFargate,
      timeout: Duration.seconds(180),
      retryAttempts: 3,
    })


  }
}