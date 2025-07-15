FROM python:3.11.4-bookworm

COPY requirements.txt /root/requirements.txt

RUN /usr/local/bin/pip install --no-cache-dir -r /root/requirements.txt

RUN /usr/local/bin/pip cache purge

COPY app/ /opt/src/app

COPY docker-entry.sh /opt/src/app/docker-entry.sh

RUN chmod +x /opt/src/app/docker-entry.sh

WORKDIR "/opt/src/app"

EXPOSE 8080

ENTRYPOINT ["/bin/sh", "-c", "./docker-entry.sh"]
