
FROM python:3.11-slim
WORKDIR  /app
COPY requirements.txt /app/requirements.txt
COPY flwr-app/flwr_app /app/flwr_app
RUN pip install -r requirements.txt
COPY . .
CMD ["flwr", "run", "."]
