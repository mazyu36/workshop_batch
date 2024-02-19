#!/bin/bash


############################################################
# Defaults                                                 #
############################################################
SCRIPT=/usr/local/bin/mnp-dask-hello.py
PORT=8786

############################################################
# Functions                                                     #
############################################################
Help()
{
   # Display Help
   echo "Run a Dask script from S3."
   echo
   echo "Syntax: run-mnp-dask [-p|s|h]"
   echo "options:"
   echo "s     S3 location of the script to fetch and run."
   echo "p     Port to run the Dask scheduler on."
   echo "h     Print this Help."
   echo
   echo "PATH=$PATH"
}

############################################################
# Process the input options. Add options as needed.        #
############################################################
# Get the options
while getopts ":h:s:p:" options; do
   case  "${options}" in
      s) # fetch the script to run, otherwise use the default HelloWorld example
        bn=$(basename $OPTARG)
        aws s3 --quiet cp $OPTARG /tmp/$bn
        chmod 755 /tmp/$bn
        SCRIPT=/tmp/$bn
        echo "INFO: Run script pulled from $OPTARG to $SCRIPT"
        ;;
      p) # port for the scheduler
        PORT=$OPTARG
        echo "INFO: Setting Dask scheduler port to $PORT"
        ;;
      h) # display Help
         Help
         exit;;
     \?) # Invalid option
         echo "Error: Invalid option"
         Help
         exit;;
   esac
done

############################################################
############################################################
# Main program                                             #
############################################################
############################################################

# check if this is the main node
if [[ -n "$AWS_BATCH_JOB_NODE_INDEX" && "$AWS_BATCH_JOB_MAIN_NODE_INDEX" == "$AWS_BATCH_JOB_NODE_INDEX" ]]
then
    # Main node, start a scheduler
    exec dask scheduler --port 8786 --no-show --scheduler-file /tmp/dask-scheduler-info.json &
    # Run our actual analysis.
    exec $SCRIPT
    exit
elif [[ -n "$AWS_BATCH_JOB_MAIN_NODE_PRIVATE_IPV4_ADDRESS" ]]
then
    # Worker node, start a worker and wait for work
    exec dask worker --nthreads $(nproc) "tcp://$AWS_BATCH_JOB_MAIN_NODE_PRIVATE_IPV4_ADDRESS:8786"
else
    # Not on AWS Batch, this is a local test of functionaily
    echo "INFO: This is a non-AWS Batch run to test the functionality."
    exec dask scheduler --no-show --scheduler-file /tmp/dask-scheduler-info.json &
    echo "Local scheduler starting"
    exec dask worker --nthreads $(nproc) --scheduler-file /tmp/dask-scheduler-info.json &
    echo "Local workers starting"
    sleep 7
    echo "Running script $SCRIPT"
    exec $SCRIPT
fi