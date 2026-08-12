# 自托管 Next.js

在 Vercel 之外自信地部署 Next.js。

## 快速开始：Standalone 输出

对于 Docker 或任何容器化部署，使用 standalone 输出：

```js
// next.config.js
module.exports = {
  output: 'standalone',
};
```

这会创建一个仅包含生产依赖的最小 `standalone` 文件夹：

```
.next/
├── standalone/
│   ├── server.js          # 入口点
│   ├── node_modules/      # 仅生产依赖
│   └── .next/             # 构建输出
└── static/                # 必须单独复制
```

## Docker 部署

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# 安装依赖
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 构建
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 生产环境
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制 standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## PM2 部署

对于传统服务器部署：

```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'nextjs',
    script: '.next/standalone/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

```bash
npm run build
pm2 start ecosystem.config.js
```

## ISR 和缓存处理器

### 问题

ISR（增量静态再生成）默认使用文件系统缓存。这在**多实例环境下会出问题**：

- 实例 A 重新生成页面 → 保存到其本地磁盘
- 实例 B 提供过期页面 → 看不到实例 A 的缓存
- 负载均衡器将用户发送到随机实例 → 内容不一致

### 解决方案：自定义缓存处理器

Next.js 14+ 支持用于共享存储的自定义缓存处理器：

```js
// next.config.js
module.exports = {
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0, // 禁用内存缓存
};
```

#### Redis 缓存处理器示例

```js
// cache-handler.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);
const CACHE_PREFIX = 'nextjs:';

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options;
  }

  async get(key) {
    const data = await redis.get(CACHE_PREFIX + key);
    if (!data) return null;

    const parsed = JSON.parse(data);
    return {
      value: parsed.value,
      lastModified: parsed.lastModified,
    };
  }

  async set(key, data, ctx) {
    const cacheData = {
      value: data,
      lastModified: Date.now(),
    };

    // 根据 revalidate 选项设置 TTL
    if (ctx?.revalidate) {
      await redis.setex(
        CACHE_PREFIX + key,
        ctx.revalidate,
        JSON.stringify(cacheData)
      );
    } else {
      await redis.set(CACHE_PREFIX + key, JSON.stringify(cacheData));
    }
  }

  async revalidateTag(tags) {
    // 实现基于标签的失效
    // 这需要跟踪哪些键有哪些标签
  }
};
```

#### S3 缓存处理器示例

```js
// cache-handler.js
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.CACHE_BUCKET;

module.exports = class CacheHandler {
  async get(key) {
    try {
      const response = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: `cache/${key}`,
      }));
      const body = await response.Body.transformToString();
      return JSON.parse(body);
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async set(key, data, ctx) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `cache/${key}`,
      Body: JSON.stringify({
        value: data,
        lastModified: Date.now(),
      }),
      ContentType: 'application/json',
    }));
  }
};
```

## 什么能工作 vs 什么需要设置

| 功能 | 单实例 | 多实例 | 注意事项 |
|---------|----------------|----------------|-------|
| SSR | 是 | 是 | 无需特殊设置 |
| SSG | 是 | 是 | 在部署时构建 |
| ISR | 是 | 需要缓存处理器 | 文件系统缓存会出问题 |
| 图像优化 | 是 | 是 | CPU 密集型，考虑 CDN |
| 中间件 | 是 | 是 | 在 Node.js 上运行 |
| Edge 运行时 | 有限 | 有限 | 某些功能仅限 Node |
| `revalidatePath/Tag` | 是 | 需要缓存处理器 | 必须共享缓存 |
| `next/font` | 是 | 是 | 字体在构建时打包 |
| 草稿模式 | 是 | 是 | 基于 Cookie |

## 图像优化

Next.js 图像优化开箱即用，但 CPU 密集。

### 选项 1：内置（简单）

自动工作，但要考虑：
- 在配置中设置 `deviceSizes` 和 `imageSizes` 以限制变体
- 使用 `minimumCacheTTL` 减少重新生成

```js
// next.config.js
module.exports = {
  images: {
    minimumCacheTTL: 60 * 60 * 24, // 24 小时
    deviceSizes: [640, 750, 1080, 1920], // 限制尺寸
  },
};
```

### 选项 2：外部加载器（推荐用于规模化）

卸载到 Cloudinary、Imgix 或类似服务：

```js
// next.config.js
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.js',
  },
};
```

```js
// lib/image-loader.js
export default function cloudinaryLoader({ src, width, quality }) {
  const params = ['f_auto', 'c_limit', `w_${width}`, `q_${quality || 'auto'}`];
  return `https://res.cloudinary.com/demo/image/upload/${params.join(',')}${src}`;
}
```

## 环境变量

### 构建时 vs 运行时

```js
// 仅在构建时可用（打包进 bundle）
NEXT_PUBLIC_API_URL=https://api.example.com

// 运行时可用（仅服务器端）
DATABASE_URL=postgresql://...
API_SECRET=...
```

### 运行时配置

对于真正的动态配置，不要使用 `NEXT_PUBLIC_*`。改用：

```tsx
// app/api/config/route.ts
export async function GET() {
  return Response.json({
    apiUrl: process.env.API_URL,
    features: process.env.FEATURES?.split(','),
  });
}
```

## OpenNext：无需 Vercel 的 Serverless

[OpenNext](https://open-next.js.org/) 将 Next.js 适配到 AWS Lambda、Cloudflare Workers 等。

```bash
npx create-sst@latest
# 或
npx @opennextjs/aws build
```

支持：
- AWS Lambda + CloudFront
- Cloudflare Workers
- Netlify Functions
- Deno Deploy

## 健康检查端点

始终为负载均衡器包含健康检查：

```tsx
// app/api/health/route.ts
export async function GET() {
  try {
    // 可选：检查数据库连接
    // await db.$queryRaw`SELECT 1`;

    return Response.json({ status: 'healthy' }, { status: 200 });
  } catch (error) {
    return Response.json({ status: 'unhealthy' }, { status: 503 });
  }
}
```

## 部署前检查清单

1. **先在本地构建**：`npm run build` - 在部署前捕获错误
2. **测试 standalone 输出**：`node .next/standalone/server.js`
3. **为 Docker 设置 `output: 'standalone'`**
4. **为多实例 ISR 配置缓存处理器**
5. **为容器设置 `HOSTNAME="0.0.0.0"`**
6. **复制 `public/` 和 `.next/static/`** - standalone 不包含
7. **添加健康检查端点**
8. **部署后测试 ISR 重新验证**
9. **监控内存使用** - Node.js 默认值可能需要调整

## 测试缓存处理器

**关键**：每次 Next.js 升级都要测试缓存处理器：

```bash
# 启动多个实例
PORT=3001 node .next/standalone/server.js &
PORT=3002 node .next/standalone/server.js &

# 触发 ISR 重新验证
curl http://localhost:3001/api/revalidate?path=/posts

# 验证两个实例都看到更新
curl http://localhost:3001/posts
curl http://localhost:3002/posts
# 应该返回相同的内容
```
