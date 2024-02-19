FROM --platform=linux/amd64 ghcr.io/dask/dask:latest

RUN apt-get update && apt-get install -y curl unzip
# Install most resent version of AWS CLI
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" &&\
 unzip awscliv2.zip &&\
 ./aws/install -i /usr/local/aws-cli -b /usr/bin &&\
 rm -fr aws awscli.zip

COPY mnp-dask-hello.py /usr/local/bin/mnp-dask-hello.py
RUN chmod 755 /usr/local/bin/mnp-dask-hello.py

COPY run-mnp-dask.sh /usr/local/bin/run-mnp-dask.sh
RUN chmod 755 /usr/local/bin/run-mnp-dask.sh

CMD /bin/bash /usr/local/bin/run-mnp-dask.sh
