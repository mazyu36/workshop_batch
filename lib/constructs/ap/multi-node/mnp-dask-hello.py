#!/usr/bin/env python
from os import environ as env, uname
import logging
from time import sleep
from dask.distributed import Client, as_completed


def hello(input):
    return "%s: Hello from Worker %s" % (str(input), uname()[1])


host = "127.0.0.1"
if "AWS_BATCH_JOB_MAIN_NODE_PRIVATE_IPV4_ADDRESS" in env.keys():
    host = env["AWS_BATCH_JOB_MAIN_NODE_PRIVATE_IPV4_ADDRESS"]
else:
    host = "127.0.0.1"

if "AWS_BATCH_JOB_NUM_NODES" in env.keys():
    num_worker_nodes = int(env["AWS_BATCH_JOB_NUM_NODES"]) - 1
else:
    num_worker_nodes = 1


dask_client = Client("tcp://%s:8786" % host)
dask_client.forward_logging()

logger = logging.getLogger("distributed")
logger.setLevel(logging.INFO)

# Wait until the number of workers == number of Batch nodes
while True:
    num_workers = len(dask_client.scheduler_info()["workers"].keys())
    logger.info("Workers %d of %d up" % (num_workers, num_worker_nodes))
    if num_workers == num_worker_nodes:
        break
    sleep(10)

futures = dask_client.map(hello, range(50))
for f in as_completed(futures):
    logger.info(f.result())
