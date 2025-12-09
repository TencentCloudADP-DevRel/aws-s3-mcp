# 快速开始：使用 MCP S3 上传文件

本指南将帮助你快速开始使用 MCP S3 服务的文件上传功能。

## 前置条件

1. **已配置好的服务**
   ```bash
   cd /Users/pro/Desktop/storage-mcp/aws-s3-mcp
   npm install
   npm run build
   ```

2. **环境变量配置** (`.env` 文件)
   ```env
   AWS_REGION=auto
   AWS_ENDPOINT=https://your-r2-endpoint.r2.cloudflarestorage.com
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_S3_FORCE_PATH_STYLE=true  # R2/MinIO 必需
   S3_BUCKETS=bucket1,bucket2
   S3_MAX_BUCKETS=10
   ```

## 启动服务

### 方式 1: HTTP 模式（用于测试和调试）

```bash
npm start -- --http
# 服务将在 http://localhost:3000 启动
```

### 方式 2: STDIO 模式（用于 MCP 客户端）

```bash
npm start -- --stdio
# 或直接
node dist/index.js --stdio
```

## 配置 MCP 客户端

### Cherry Studio / Claude Desktop / CodeBuddy

**推荐：STDIO 模式**

编辑配置文件（例如 `~/Library/Application Support/CodeBuddyExtension/Cache/CodeBuddyIDE/CodeBuddy CN/mcp/settings.json`）：

```json
{
  "mcpServers": {
    "aws-s3": {
      "command": "node",
      "args": [
        "/Users/pro/Desktop/storage-mcp/aws-s3-mcp/dist/index.js",
        "--stdio"
      ],
      "env": {
        "AWS_REGION": "auto",
        "AWS_ENDPOINT": "https://your-r2-endpoint.r2.cloudflarestorage.com",
        "AWS_ACCESS_KEY_ID": "your-access-key",
        "AWS_SECRET_ACCESS_KEY": "your-secret-key",
        "AWS_S3_FORCE_PATH_STYLE": "true",
        "S3_BUCKETS": "bucket1,bucket2",
        "S3_MAX_BUCKETS": "10"
      }
    }
  }
}
```

**备选：HTTP SSE 模式**（如果遇到超时，建议改用 STDIO）

```json
{
  "mcpServers": {
    "aws-s3": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

## 使用示例

### 1. 在 Claude/AI 助手中使用自然语言

重启客户端后，你可以直接用自然语言请求：

#### 上传文本文件
```
请帮我创建一个 README.md 文件并上传到 my-bucket 的 docs 目录，
内容是：
# 项目说明
这是一个测试项目
```

#### 上传配置文件
```
把这个 JSON 配置保存到 my-bucket/config/settings.json：
{
  "version": "1.0.0",
  "enabled": true,
  "timeout": 30
}
```

#### 上传代码文件
```
将以下代码上传到 my-bucket/src/main.js：
console.log('Hello World');
```

### 2. 直接调用 MCP 工具（HTTP 模式测试）

#### 初始化连接
```bash
SESSION_ID=$(uuidgen)

curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

#### 上传文本文件
```bash
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "put-object",
      "arguments": {
        "bucket": "my-bucket",
        "key": "test.txt",
        "content": "Hello World!",
        "encoding": "text"
      }
    }
  }' | jq .
```

#### 上传 JSON 文件
```bash
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "put-object",
      "arguments": {
        "bucket": "my-bucket",
        "key": "data.json",
        "content": "{\"name\":\"test\",\"value\":123}",
        "contentType": "application/json",
        "encoding": "text"
      }
    }
  }' | jq .
```

#### 上传二进制文件（base64）
```bash
# 先将文件转换为 base64
BASE64_CONTENT=$(cat image.png | base64)

curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 4,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"put-object\",
      \"arguments\": {
        \"bucket\": \"my-bucket\",
        \"key\": \"images/test.png\",
        \"content\": \"$BASE64_CONTENT\",
        \"contentType\": \"image/png\",
        \"encoding\": \"base64\"
      }
    }
  }" | jq .
```

#### 验证上传
```bash
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "get-object",
      "arguments": {
        "bucket": "my-bucket",
        "key": "test.txt"
      }
    }
  }' | jq -r '.result.content[0].text'
```

## 完整工作流示例

### 场景：创建和发布网站内容

```bash
# 1. 上传 HTML 页面
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "tools/call",
    "params": {
      "name": "put-object",
      "arguments": {
        "bucket": "my-website",
        "key": "index.html",
        "content": "<!DOCTYPE html><html><head><title>My Site</title></head><body><h1>Welcome</h1></body></html>",
        "contentType": "text/html",
        "encoding": "text"
      }
    }
  }'

# 2. 上传 CSS 样式
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 11,
    "method": "tools/call",
    "params": {
      "name": "put-object",
      "arguments": {
        "bucket": "my-website",
        "key": "style.css",
        "content": "body { font-family: Arial; margin: 20px; }",
        "contentType": "text/css",
        "encoding": "text"
      }
    }
  }'

# 3. 列出已上传的文件
curl -X POST "http://localhost:3000/mcp?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 12,
    "method": "tools/call",
    "params": {
      "name": "list-objects",
      "arguments": {
        "bucket": "my-website"
      }
    }
  }' | jq '.result.content[0].text'
```

## 支持的文件类型

### 文本文件（encoding: "text"）
- `.txt` - 纯文本
- `.json` - JSON 数据
- `.xml` - XML 文档
- `.html`, `.htm` - HTML 页面
- `.css` - 样式表
- `.js`, `.ts` - JavaScript/TypeScript
- `.md` - Markdown
- `.csv` - CSV 数据
- `.yml`, `.yaml` - YAML 配置

### 二进制文件（encoding: "base64"）
- `.jpg`, `.png`, `.gif`, `.webp` - 图片
- `.pdf` - PDF 文档
- `.zip`, `.tar`, `.gz` - 压缩包
- `.mp4`, `.webm` - 视频
- `.mp3`, `.wav` - 音频

### 内容类型自动检测

如果不指定 `contentType`，系统会根据文件扩展名自动检测：

```javascript
// 自动检测示例
{
  "key": "data.json",
  // contentType 自动设置为 "application/json"
}

{
  "key": "image.png",
  // contentType 自动设置为 "image/png"
}
```

## 故障排查

### 问题 1: 连接超时（Cherry Studio）

**症状：** `MCP error -32001: Request timed out`

**解决方案：** 改用 STDIO 模式而不是 HTTP SSE

```json
{
  "command": "node",
  "args": ["/path/to/dist/index.js", "--stdio"],
  "env": { ... }
}
```

### 问题 2: 桶拒绝访问

**症状：** `Bucket xxx is not in the allowed buckets list`

**解决方案：** 检查 `S3_BUCKETS` 环境变量是否包含该桶

```env
S3_BUCKETS=bucket1,bucket2,bucket3
```

### 问题 3: R2 连接失败

**症状：** 连接 R2 时出错

**解决方案：** 确保设置了 `AWS_S3_FORCE_PATH_STYLE=true`

```env
AWS_S3_FORCE_PATH_STYLE=true
```

### 问题 4: 上传大文件失败

**症状：** 上传大文件时超时或失败

**解决方案：** 
- base64 编码会增加约 33% 的大小
- MCP 协议有消息大小限制
- 建议文件大小 < 10MB
- 更大的文件考虑使用 S3 预签名 URL（未来功能）

## 性能提示

1. **批量上传**
   - 对于多个小文件，依次调用 `put-object`
   - 使用相同的 sessionId 可以复用连接

2. **内容类型**
   - 文本文件使用 `encoding: "text"`（更高效）
   - 二进制文件必须使用 `encoding: "base64"`

3. **桶限制**
   - 设置 `S3_BUCKETS` 限制可访问的桶
   - 提高安全性和性能

## 安全建议

1. **环境变量管理**
   - 不要将 `.env` 文件提交到版本控制
   - 使用 IAM 角色而不是长期凭证（生产环境）

2. **最小权限原则**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:ListBucket",
           "s3:GetObject",
           "s3:PutObject"
         ],
         "Resource": [
           "arn:aws:s3:::my-bucket",
           "arn:aws:s3:::my-bucket/*"
         ]
       }
     ]
   }
   ```

3. **桶访问控制**
   - 始终设置 `S3_BUCKETS` 限制可访问的桶
   - 定期审查桶权限

## 更多资源

- **完整文档**: [README.md](./README.md)
- **优化总结**: [OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md)
- **GitHub Issues**: 报告问题和功能请求
- **MCP 协议**: https://modelcontextprotocol.io/

## 下一步

现在你已经掌握了基础使用方法，可以：

1. 在 AI 助手中尝试自然语言上传
2. 编写自动化脚本批量上传文件
3. 集成到你的工作流中
4. 探索更多 MCP 工具组合使用

祝你使用愉快！🚀
