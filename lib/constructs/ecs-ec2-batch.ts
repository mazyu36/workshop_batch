import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { aws_batch as batch } from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export interface EcsEc2BatchProps {
  vpc: ec2.Vpc

}

export class EcsEc2Batch extends Construct {
  constructor(scope: Construct, id: string, props: EcsEc2BatchProps) {
    super(scope, id);


    const computeEnvironment = new batch.ManagedEc2EcsComputeEnvironment(this, 'ComputeEnvironment', {
      vpc: props.vpc,
      maxvCpus: 256,
      minvCpus: 0,
      spot: false,
      allocationStrategy: batch.AllocationStrategy.BEST_FIT_PROGRESSIVE,
      computeEnvironmentName: 'stress-ng-ec2',
      instanceTypes: [
        ec2.InstanceType.of(ec2.InstanceClass.C7A, ec2.InstanceSize.MEDIUM),
        ec2.InstanceType.of(ec2.InstanceClass.C7A, ec2.InstanceSize.LARGE),
        ec2.InstanceType.of(ec2.InstanceClass.M7A, ec2.InstanceSize.MEDIUM),
        ec2.InstanceType.of(ec2.InstanceClass.M7A, ec2.InstanceSize.LARGE),
      ],
      useOptimalInstanceClasses: false
    })


    new batch.JobQueue(this, 'JobQueue', {
      priority: 1,
      computeEnvironments: [
        {
          computeEnvironment: computeEnvironment,
          order: 1
        }
      ],
      jobStateTimeLimitActions: [
        {
          action: batch.JobStateTimeLimitActionsAction.CANCEL,
          maxTime: Duration.minutes(10),
          reason: batch.JobStateTimeLimitActionsReason.INSUFFICIENT_INSTANCE_CAPACITY,
          state: batch.JobStateTimeLimitActionsState.RUNNABLE,
        },
        {
          action: batch.JobStateTimeLimitActionsAction.CANCEL,
          maxTime: Duration.minutes(10),
          reason: batch.JobStateTimeLimitActionsReason.COMPUTE_ENVIRONMENT_MAX_RESOURCE,
          state: batch.JobStateTimeLimitActionsState.RUNNABLE,
        },
        {
          maxTime: Duration.minutes(10),
          reason: batch.JobStateTimeLimitActionsReason.JOB_RESOURCE_REQUIREMENT,
        },
      ],
      jobQueueName: 'stress-ng-queue'
    })

    // ----- Single Job -----
    const containerDefinition = new batch.EcsEc2ContainerDefinition(this, 'ContainerDefinition', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/single")
      ),
      cpu: 1,
      memory: Size.mebibytes(1024),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'single-job',
        logGroup: new logs.LogGroup(this, 'SingleJobLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY
        })
      }),
    })

    new batch.EcsJobDefinition(this, 'JobDefinition', {
      container: containerDefinition,
      timeout: Duration.seconds(180),
      retryAttempts: 3,
      jobDefinitionName: 'stress-ng-job-definition'
    })



    // ----- Array Job -----
    const arrayContainerDefinition = new batch.EcsEc2ContainerDefinition(this, 'ArrayContainerDefinition', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/array")
      ),
      cpu: 1,
      memory: Size.mebibytes(1024),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'array-job',
        logGroup: new logs.LogGroup(this, 'ArrayJobLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY
        })
      }),
    })

    new batch.EcsJobDefinition(this, 'ArrayJobDefinition', {
      container: arrayContainerDefinition,
      timeout: Duration.seconds(180),
      retryAttempts: 3,
      jobDefinitionName: 'stress-ng-array-job-definition'
    })


    // -----  Multi-node Parallel Job -----
    const multiNodeContainerDefinition = new batch.EcsEc2ContainerDefinition(this, 'MultiNodeContainerDefinition', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/multi-node")
      ),
      cpu: 2,
      memory: Size.mebibytes(1024),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'mnp-job',
        logGroup: new logs.LogGroup(this, 'MnpJobLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY
        })
      }),
    })

    new batch.MultiNodeJobDefinition(this, 'MultiNodeJobDefinition', {
      containers: [{
        container: multiNodeContainerDefinition,
        startNode: 0,
        endNode: 2
      }],
      timeout: Duration.seconds(180),
      retryAttempts: 3,
      jobDefinitionName: 'mnp-job-definition'
    })

    computeEnvironment.connections.allowInternally(ec2.Port.allTcp())


    // ----- Jobs With dependency -----
    const bucket = new s3.Bucket(this, 'Bucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    new CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      exportName: 'Bucket',
      key: 'Bucket'
    });


    // leader job
    const leaderContainerDefinition = new batch.EcsEc2ContainerDefinition(this, 'LeaderContainerDefinition', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/dependency/leader")
      ),
      cpu: 1,
      memory: Size.mebibytes(1024),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'leader-job',
        logGroup: new logs.LogGroup(this, 'LeaderJobLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY
        })
      }),
    })
    bucket.grantReadWrite(computeEnvironment.instanceRole!)
    bucket.grantReadWrite(leaderContainerDefinition.executionRole)


    new batch.EcsJobDefinition(this, 'LeaderJobDefinition', {
      container: leaderContainerDefinition,
      timeout: Duration.seconds(180),
      retryAttempts: 3,
      jobDefinitionName: 'stress-ng-leader-job-definition'
    })

    // follower job
    const followerContainerDefinition = new batch.EcsEc2ContainerDefinition(this, 'FollowerContainerDefinition', {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "./", "ap/dependency/follower")
      ),
      cpu: 1,
      memory: Size.mebibytes(1024),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'follower-job',
        logGroup: new logs.LogGroup(this, 'FollowerJobLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY
        })
      }),
    })
    bucket.grantReadWrite(followerContainerDefinition.executionRole)

    new batch.EcsJobDefinition(this, 'FollowerJobDefinition', {
      container: followerContainerDefinition,
      timeout: Duration.seconds(180),
      retryAttempts: 3,
      jobDefinitionName: 'stress-ng-follower-job-definition'
    })



    // follower job (Spot)
    const computeEnvironmentSpot = new batch.ManagedEc2EcsComputeEnvironment(this, 'ComputeEnvironmentSpot', {
      vpc: props.vpc,
      maxvCpus: 256,
      minvCpus: 0,
      spot: true,
      spotBidPercentage: 100,
      allocationStrategy: batch.AllocationStrategy.SPOT_CAPACITY_OPTIMIZED,
      computeEnvironmentName: 'stress-ng-ce-spot',
      instanceTypes: [
        ec2.InstanceType.of(ec2.InstanceClass.C7A, ec2.InstanceSize.MEDIUM),
        ec2.InstanceType.of(ec2.InstanceClass.C7A, ec2.InstanceSize.LARGE),
        ec2.InstanceType.of(ec2.InstanceClass.M7A, ec2.InstanceSize.MEDIUM),
        ec2.InstanceType.of(ec2.InstanceClass.M7A, ec2.InstanceSize.LARGE),
      ],
      useOptimalInstanceClasses: false

    })
    bucket.grantReadWrite(computeEnvironmentSpot.instanceRole!)


    new batch.JobQueue(this, 'JobQueueSpot', {
      priority: 1,
      computeEnvironments: [
        {
          computeEnvironment: computeEnvironmentSpot,
          order: 1
        }
      ],
      jobQueueName: 'stress-ng-queue-spot'
    })

    new batch.EcsJobDefinition(this, 'FollowerSpotJobDefinition', {
      container: followerContainerDefinition,
      timeout: Duration.seconds(180),
      jobDefinitionName: 'stress-ng-follower-spot-job-definition',
      retryAttempts: 5,
      retryStrategies: [
        batch.RetryStrategy.of(batch.Action.RETRY, batch.Reason.custom({ onStatusReason: 'Host EC2*', })),
        batch.RetryStrategy.of(batch.Action.EXIT, batch.Reason.custom({ onReason: '*', })),
      ]
    })

  }
}