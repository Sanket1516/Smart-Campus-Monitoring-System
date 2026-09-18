# AWS Deployment Roadmap

This plan is tailored to the `smart-campus-monitor` repository.

## Scope

Deploy:
- React frontend to Amazon S3
- Optional CloudFront in front of S3
- Backend separately on AWS without Ollama
- MongoDB on the same EC2 instance as the backend

Do not deploy:
- Prometheus
- Grafana
- Ollama

## Recommended AWS Architecture

Frontend:
- Amazon S3 for static hosting
- Amazon CloudFront for HTTPS, caching, and SPA routing support
- Amazon Route 53 if you want a custom domain

Backend:
- Option A: EC2 for the fastest student-project deployment
- Option B: ECS Fargate for a cleaner production setup

Database:
- MongoDB Community Edition on the backend EC2 instance
- Amazon DocumentDB is excluded because it is not a free-tier database option

## Suggested Rollout Order

1. Prepare production environment variables
2. Deploy the backend API
3. Verify backend health endpoint
4. Build the React frontend with the backend URL
5. Deploy the React build to S3
6. Add CloudFront and custom domain later

## Frontend Deployment Plan

The frontend already supports a production API URL through `VITE_API_URL`.

Use:
- `VITE_API_URL=https://your-backend-domain/api`
- `VITE_SOCKET_URL=https://your-backend-domain`

Because this is a React Router SPA, configure the hosting layer so unknown routes return `index.html`.

For S3 static website hosting:
- Index document: `index.html`
- Error document: `index.html`

For CloudFront:
- Add a custom error response so `403` and `404` return `/index.html`

## Backend Deployment Plan

Do not use the current `docker-compose.yml` in production as-is because it includes:
- `ollama`
- `prometheus`
- `grafana`

Instead deploy only the backend service and point it to:
- a production MongoDB connection string
- the frontend domain in `CLIENT_URL`

Important backend environment variables:
- `NODE_ENV=production`
- `PORT=5000`
- `MONGO_URI=<your production mongo uri>`
- `CLIENT_URL=https://your-frontend-domain`
- `JWT_SECRET=<strong secret>`
- `FP_SECRET=<strong secret>`
- `AI_TIMEOUT_MS=1800`

Ollama-related variables are optional for this rollout because the code falls back safely when Ollama is unavailable.

## AWS Service Recommendation

For an AWS-only free-tier demo:
- Frontend on S3
- Backend on one Ubuntu EC2 instance
- MongoDB Community Edition on the same EC2 instance

This single-instance design is for development/demo use. Use an attached EBS volume, backups, and a larger managed architecture before production traffic; those may create charges.

If you want a cleaner production path later:
- Frontend on S3 + CloudFront
- Backend on ECS Fargate
- MongoDB Atlas

## Step-by-Step: React to S3

1. Create `frontend/.env.production` from `frontend/.env.production.example`
2. Build the frontend:

```powershell
cd frontend
npm install
npm run build
```

3. Create an S3 bucket
4. Enable static website hosting
5. Upload `frontend/dist` contents to the bucket
6. Set the bucket policy or CloudFront access model
7. Test:
- `/`
- `/login`
- `/dashboard`
- `/live`

## S3 Commands

These commands assume the AWS CLI is installed and configured.

```powershell
aws s3 mb s3://smart-campus-monitor-frontend
aws s3 sync frontend/dist s3://smart-campus-monitor-frontend --delete
```

If using S3 static website hosting:

```powershell
aws s3 website s3://smart-campus-monitor-frontend --index-document index.html --error-document index.html
```

## CloudFront Follow-Up

Recommended after the first successful S3 deployment:
- Create a CloudFront distribution pointing to the S3 bucket
- Redirect HTTP to HTTPS
- Set default root object to `index.html`
- Add SPA fallback for `403` and `404`
- Attach ACM certificate for your custom domain

## Repo-Specific Notes

- The frontend defaults to `/api` in local development and needs `VITE_API_URL` in production.
- Socket.IO will derive its URL from `VITE_API_URL`, but setting `VITE_SOCKET_URL` explicitly is safer in production.
- The frontend build completed successfully on September 1, 2026.
- The production bundle is currently large, so later we should split some routes to improve initial load time.

## Immediate Next Actions

1. Deploy or prepare the backend URL first
2. Set `frontend/.env.production`
3. Install and configure the AWS CLI on the deployment machine
4. Run the S3 sync commands
5. Add CloudFront once the bucket deployment is confirmed

## Free-Tier Guardrails

- Choose the AWS Free account plan if eligible; new accounts receive credits and access to selected free usage, but eligibility depends on account age and region.
- Stop the EC2 instance when it is not needed and delete unused EBS volumes, Elastic IPs, load balancers, NAT gateways, and snapshots.
- Do not create NAT Gateway, Application Load Balancer, ECS Fargate, DocumentDB, or managed monitoring for this first deployment.
- Create an AWS Budget alert before launching resources. Free-tier credits and limits can expire or vary by account; check the AWS Billing console regularly.
