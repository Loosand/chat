# 配置和构建扩展

使用 `trigger.config.ts` 配置项目和添加构建扩展。

## 基础配置

```ts
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
	project: "<project-ref>", // 必需：项目参考 ID
	dirs: ["./trigger"], // 任务目录
	runtime: "node", // "node", "node-22", 或 "bun"
	logLevel: "info", // "debug", "info", "warn", "error"

	// 默认重试配置
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 1000,
			maxTimeoutInMs: 10000,
			factor: 2,
			randomize: true,
		},
	},

	// 构建配置
	build: {
		autoDetectExternal: true,
		keepNames: true,
		minify: false,
		extensions: [], // 构建扩展列表
	},

	// 全局生命周期钩子
	onStartAttempt: async ({ payload, ctx }) => {
		console.log("Global task start")
	},
	onSuccess: async ({ payload, output, ctx }) => {
		console.log("Global task success")
	},
	onFailure: async ({ payload, error, ctx }) => {
		console.log("Global task failure")
	},
})
```

## 构建扩展

### Prisma

```ts
import { prismaExtension } from "@trigger.dev/build/extensions/prisma"

extensions: [
	prismaExtension({
		schema: "prisma/schema.prisma",
		version: "5.19.0", // 可选：指定版本
		migrate: true, // 构建时运行迁移
		directUrlEnvVarName: "DIRECT_DATABASE_URL",
		typedSql: true, // 启用 TypedSQL
	}),
]
```

### Playwright

```ts
import { playwright } from "@trigger.dev/build/extensions/playwright"

extensions: [
	playwright({
		browsers: ["chromium", "firefox", "webkit"], // 默认: ["chromium"]
		headless: true,
	}),
]
```

### Puppeteer

```ts
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer"

extensions: [puppeteer()]

// 需要环境变量
// PUPPETEER_EXECUTABLE_PATH: "/usr/bin/google-chrome-stable"
```

### FFmpeg

```ts
import { ffmpeg } from "@trigger.dev/build/extensions/core"

extensions: [
	ffmpeg({ version: "7" }), // 静态构建，或省略使用 Debian 版本
]

// 自动设置 FFMPEG_PATH 和 FFPROBE_PATH
```

### Python

```ts
import { pythonExtension } from "@trigger.dev/build/extensions/python"

extensions: [
	pythonExtension({
		scripts: ["./python/**/*.py"],
		requirementsFile: "./requirements.txt",
		devPythonBinaryPath: ".venv/bin/python",
	}),
]
```

### 系统包（apt-get）

```ts
import { aptGet } from "@trigger.dev/build/extensions/core"

extensions: [
	aptGet({
		packages: ["ffmpeg", "imagemagick", "curl=7.68.0-1"], // 支持版本指定
	}),
]
```

### 额外包

仅用于 CLI 工具，不要用于项目代码中的包：

```ts
import { additionalPackages } from "@trigger.dev/build/extensions/core"

extensions: [
	additionalPackages({
		packages: ["wrangler"], // CLI 工具
	}),
]
```

### 额外文件

```ts
import { additionalFiles } from "@trigger.dev/build/extensions/core"

extensions: [
	additionalFiles({
		files: ["wrangler.toml", "./assets/**", "./fonts/**"],
	}),
]
```

### 环境变量同步

```ts
import { syncEnvVars } from "@trigger.dev/build/extensions/core"

extensions: [
	syncEnvVars(async (ctx) => {
		return [
			{ name: "SECRET_KEY", value: await getSecret(ctx.environment) },
			{
				name: "API_URL",
				value:
					ctx.environment === "prod"
						? "https://api.prod.com"
						: "https://api.dev.com",
			},
		]
	}),
]
```

### ESBuild 插件

```ts
import { esbuildPlugin } from "@trigger.dev/build/extensions"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"

extensions: [
	esbuildPlugin(
		sentryEsbuildPlugin({
			org: process.env.SENTRY_ORG,
			project: process.env.SENTRY_PROJECT,
			authToken: process.env.SENTRY_AUTH_TOKEN,
		}),
		{ placement: "last", target: "deploy" }
	),
]
```

## 常见扩展组合

### 全栈 Web App

```ts
extensions: [
  prismaExtension({ schema: "prisma/schema.prisma", migrate: true }),
  additionalFiles({ files: ["./public/**", "./assets/**"] }),
  syncEnvVars(async (ctx) => [...]),
];
```

### AI/ML 处理

```ts
extensions: [
	pythonExtension({
		scripts: ["./ai/**/*.py"],
		requirementsFile: "./requirements.txt",
	}),
	ffmpeg({ version: "7" }),
	additionalPackages({ packages: ["wrangler"] }),
]
```

### Web 爬虫

```ts
extensions: [
	playwright({ browsers: ["chromium"] }),
	puppeteer(),
	additionalFiles({ files: ["./selectors.json", "./proxies.txt"] }),
]
```

## 自定义扩展

创建自定义构建扩展：

```ts
const customExtension = {
	name: "my-custom-extension",

	externalsForTarget: (target) => {
		return ["some-native-module"]
	},

	onBuildStart: async (context) => {
		console.log(`Build starting for ${context.target}`)
		// 注册 esbuild 插件，修改构建上下文
	},

	onBuildComplete: async (context, manifest) => {
		console.log("Build complete, adding layers")
		context.addLayer({
			id: "my-layer",
			files: [{ source: "./custom-file", destination: "/app/custom" }],
			commands: ["chmod +x /app/custom"],
		})
	},
}

export default defineConfig({
	project: "my-project",
	build: {
		extensions: [customExtension],
	},
})
```

## 遥测

```ts
import { PrismaInstrumentation } from "@prisma/instrumentation"
import { OpenAIInstrumentation } from "@langfuse/openai"

export default defineConfig({
	// ... 其他配置
	telemetry: {
		instrumentations: [
			new PrismaInstrumentation(),
			new OpenAIInstrumentation(),
		],
		exporters: [customExporter], // 可选：自定义导出器
	},
})
```

## 机器和性能

```ts
export default defineConfig({
	// ... 其他配置
	defaultMachine: "large-1x", // 所有任务的默认机器
	maxDuration: 300, // 默认最大时长（秒）
	enableConsoleLogging: true, // 开发环境的控制台日志
})
```

## 最佳实践

1. **版本锁定**: 为扩展指定特定版本以保证可重现的构建
2. **外部包**: 对有原生 addons 的模块添加到 `build.external`
3. **环境变量同步**: 使用 `syncEnvVars` 处理动态 secrets
4. **文件路径**: 使用 glob 模式灵活包含文件
5. **本地开发**: 扩展仅影响部署，不影响本地开发

## 调试构建

```bash
# 查看详细构建日志
npx trigger.dev@latest deploy --log-level debug

# 干跑模式（不实际部署）
npx trigger.dev@latest deploy --dry-run
```

## 下一步

- 学习 [实时功能](realtime.md)
- 查看 [完整示例](../examples/)
- 阅读 [API 速查](../reference/api-reference.md)
