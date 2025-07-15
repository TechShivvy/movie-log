FROM python:3.11.4-bookworm

ARG API_VERSION

COPY requirements.txt /root/requirements.txt

RUN /usr/local/bin/pip install --no-cache-dir -r /root/requirements.txt

RUN /usr/local/bin/pip cache purge

COPY app/ /opt/src/app

COPY docker-entry.sh /opt/src/app/docker-entry.sh

RUN chmod +x /opt/src/app/docker-entry.sh

WORKDIR "/opt/src/app"

ENV ENV="PROD"
ENV API_VERSION=${API_VERSION:-v9.9.9}
ENV LOGURU_LEVEL="INFO"
ENV LOGURU_FORMAT="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <m>[</m>{process}<m>]</m> | <cyan>{name}</cyan><m>:</m><cyan>{function}</cyan><m>:</m><cyan>{line}</cyan> - '<level>{message}</level>"

EXPOSE 8080

ENTRYPOINT ["/bin/sh", "-c", "./docker-entry.sh"]
