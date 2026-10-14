# 1. Install dependencies only when needed
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Rebuild the source code only when needed
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments provided by Coolify / CI
ARG NEXT_PUBLIC_RAZORPAY_KEY
ARG NEXT_PUBLIC_STRAPI_TOKEN
ARG STRAPI_API_URL
ARG RAZORPAY_SECRET
ARG NEXT_PUBLIC_BASE_URL

ENV NEXT_PUBLIC_RAZORPAY_KEY=$NEXT_PUBLIC_RAZORPAY_KEY
ENV NEXT_PUBLIC_STRAPI_TOKEN=$NEXT_PUBLIC_STRAPI_TOKEN
ENV STRAPI_API_URL=$STRAPI_API_URL
ENV RAZORPAY_SECRET=$RAZORPAY_SECRET
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# 3. Production image, copy all the files and run next
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder /app/public ./public

# Set permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
