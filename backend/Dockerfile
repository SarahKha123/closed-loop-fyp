# The API image: FastAPI, the trained models and the replay dataset. Build from the repo root:
#   docker build -f backend/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t closed-loop-api .
# Runs Postgres migrations on start when DATABASE_URL is set (one task, so they never race), then serves :8000.
FROM python:3.12-slim

# libgomp: XGBoost and scikit-learn's OpenMP
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Amazon RDS's CA, so DATABASE_URL can use sslmode=verify-full (infra/main.tf)
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem

# The models aren't committed: train them here, on the installed library versions (~1.5 min).
# Before the app code, so an API-only change reuses this layer.
COPY backend/data backend/data
COPY backend/ml backend/ml
RUN cd backend && python -m ml.train

COPY backend/app backend/app
COPY config/settings.json config/study_scenarios.json config/

RUN useradd --system app && chown -R app /app/config
USER app
WORKDIR /app/backend

ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA PYTHONUNBUFFERED=1
EXPOSE 8000
# --proxy-headers: the client's IP comes from X-Forwarded-For (CloudFront → load balancer), for the sign-in audit log
CMD ["sh", "-c", "[ -z \"$DATABASE_URL\" ] || python -m app.services.migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
