# S3 MCP Server 配置指南

## 配置方式

S3 MCP Server 支持两种配置方式：

### 1. HTTP Headers 配置（推荐用于 StreamableHTTP 传输）

通过 HTTP Headers 传递配置，支持多租户、动态配置。

#### CodeBuddy 配置示例

```json
{
  "mcpServers": {
    "aws-s3": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamablehttp",
      "headers": [
        {
          "key": "S3-Region",
          "value": "auto",
          "appDefined": true
        },
        {
          "key": "S3-Endpoint",
          "value": "https://944fc762bf083e328185347cb4c9b81d.r2.cloudflarestorage.com",
          "appDefined": true
        },
        {
          "key": "S3-Access-Key-Id",
          "value": "d7d92d039de241beb3676ad4ee2df30b",
          "appDefined": true
        },
        {
          "key": "S3-Secret-Access-Key",
          "value": "e59f57a34eb94eca3e78de0383e728f03ace66a1e3105fcfec4154c7208953ce",
          "appDefined": true
        },
        {
          "key": "S3-Buckets",
          "value": "adp,hunuyan3d",
          "appDefined": true
        },
        {
          "key": "S3-Force-Path-Style",
          "value": "true",
          "appDefined": true
        }
      ],
      "timeout": "5",
      "sse_read_timeout": "300"
    }
  }
}
```

#### 支持的 Headers

| Header 名称 | 说明 | 示例 | 必填 |
|------------|------|------|------|
| `S3-Region` | AWS 区域 | `us-east-1`, `auto` | 否（默认 `us-east-1`） |
| `S3-Endpoint` | 自定义端点（MinIO/R2/OSS等） | `https://xxx.r2.cloudflarestorage.com` | 否 |
| `S3-Access-Key-Id` | 访问密钥 ID | `d7d92d039de241beb3676ad4ee2df30b` | 否 |
| `S3-Secret-Access-Key` | 访问密钥 Secret | `e59f57a34eb94eca...` | 否 |
| `S3-Buckets` | 允许访问的桶列表（逗号分隔） | `bucket1,bucket2` | 否 |
| `S3-Force-Path-Style` | 强制路径风格 URL | `true` 或 `false` | 否（MinIO/R2 需要设为 `true`） |

### 2. 环境变量配置（兼容模式）

如果 HTTP Headers 中没有提供配置，将回退到环境变量。

#### .env 文件示例

```env
AWS_REGION=auto
AWS_ENDPOINT=https://944fc762bf083e328185347cb4c9b81d.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=d7d92d039de241beb3676ad4ee2df30b
AWS_SECRET_ACCESS_KEY=e59f57a34eb94eca3e78de0383e728f03ace66a1e3105fcfec4154c7208953ce
AWS_S3_FORCE_PATH_STYLE=true
S3_BUCKETS=adp,hunuyan3d
S3_MAX_BUCKETS=5
```

## 不同存储服务的配置

### AWS S3（标准）

```json
{
  "headers": [
    {"key": "S3-Region", "value": "us-east-1"},
    {"key": "S3-Access-Key-Id", "value": "YOUR_ACCESS_KEY"},
    {"key": "S3-Secret-Access-Key", "value": "YOUR_SECRET_KEY"}
  ]
}
```

### CloudFlare R2

```json
{
  "headers": [
    {"key": "S3-Region", "value": "auto"},
    {"key": "S3-Endpoint", "value": "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"},
    {"key": "S3-Access-Key-Id", "value": "YOUR_ACCESS_KEY"},
    {"key": "S3-Secret-Access-Key", "value": "YOUR_SECRET_KEY"},
    {"key": "S3-Force-Path-Style", "value": "true"}
  ]
}
```

### MinIO

```json
{
  "headers": [
    {"key": "S3-Region", "value": "us-east-1"},
    {"key": "S3-Endpoint", "value": "http://localhost:9000"},
    {"key": "S3-Access-Key-Id", "value": "minioadmin"},
    {"key": "S3-Secret-Access-Key", "value": "minioadmin"},
    {"key": "S3-Force-Path-Style", "value": "true"}
  ]
}
```

### 阿里云 OSS

```json
{
  "headers": [
    {"key": "S3-Region", "value": "oss-cn-hangzhou"},
    {"key": "S3-Endpoint", "value": "https://oss-cn-hangzhou.aliyuncs.com"},
    {"key": "S3-Access-Key-Id", "value": "YOUR_ACCESS_KEY"},
    {"key": "S3-Secret-Access-Key", "value": "YOUR_SECRET_KEY"}
  ]
}
```

## 启动服务

### HTTP 模式（推荐）

```bash
npm start -- --http
# 或指定端口
PORT=3000 npm start -- --http
```

### STDIO 模式

```bash
npm start
```

## 多租户配置

HTTP Headers 配置支持多个客户端连接到同一个服务，使用不同的 S3 配置：

**客户端 A** - 连接到 CloudFlare R2：
```json
{
  "aws-s3-r2": {
    "url": "http://your-vps.com:3000/mcp",
    "headers": [
      {"key": "S3-Endpoint", "value": "https://account1.r2.cloudflarestorage.com"},
      {"key": "S3-Access-Key-Id", "value": "key1"}
    ]
  }
}
```

**客户端 B** - 连接到 AWS S3：
```json
{
  "aws-s3": {
    "url": "http://your-vps.com:3000/mcp",
    "headers": [
      {"key": "S3-Region", "value": "us-west-2"},
      {"key": "S3-Access-Key-Id", "value": "key2"}
    ]
  }
}
```

两个客户端可以同时连接到同一个服务器实例，使用各自的配置。

## 安全建议

1. **生产环境使用 HTTPS**：通过 Nginx 反向代理添加 SSL
2. **限制 CORS**：修改服务器代码中的 CORS 配置
3. **使用防火墙**：限制只允许特定 IP 访问
4. **定期轮换密钥**：定期更换访问密钥
5. **最小权限原则**：S3 IAM 权限设置为最小必要权限

## 故障排查

### 连接超时
- 检查服务器是否正常运行：`curl http://localhost:3000/health`
- 检查防火墙设置
- 检查 Headers 是否正确配置

### 认证失败
- 确认 `S3-Access-Key-Id` 和 `S3-Secret-Access-Key` 正确
- 检查 IAM 权限配置

### Bucket 访问失败
- 如果使用 `S3-Buckets` 限制，确保桶名在列表中
- 检查 `S3-Force-Path-Style` 是否设置正确（MinIO/R2 必须为 `true`）
