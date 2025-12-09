# Cloudflare 部署指南

本文档介绍如何将 S3 MCP 服务器部署到 Cloudflare，提供安全、快速的全球访问。

## 推荐方案：VPS + Cloudflare Tunnel

这是最适合 MCP 服务器的部署方案，结合了传统 VPS 的灵活性和 Cloudflare 的安全性、性能优势。

### 方案优势

✅ **免费 HTTPS** - 自动配置 SSL 证书  
✅ **DDoS 保护** - Cloudflare 的全球防护网络  
✅ **全球加速** - 通过 Cloudflare CDN 加速访问  
✅ **无需开放端口** - 不需要在 VPS 上开放公网端口  
✅ **隐藏源 IP** - 保护服务器真实 IP  
✅ **支持长连接** - 完美支持 StreamableHTTP 传输  

---

## 部署步骤

### 第一步：准备 VPS 服务器

选择任意 VPS 提供商（阿里云、腾讯云、AWS、DigitalOcean 等），要求：
- 操作系统：Ubuntu 20.04+ / Debian 11+ / CentOS 7+
- 内存：至少 512MB
- 磁盘：至少 1GB

### 第二步：在 VPS 上安装依赖

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. 验证安装
node -v
npm -v
```

### 第三步：部署 MCP 服务器

```bash
# 1. 克隆或上传项目
git clone https://github.com/samuraikun/aws-s3-mcp.git
cd aws-s3-mcp

# 或者使用 npm 全局安装
npm install -g aws-s3-mcp

# 2. 安装依赖并构建
npm install
npm run build

# 3. 创建 .env 文件（可选，如果不使用 Headers 配置）
cat > .env << EOF
AWS_REGION=auto
AWS_ENDPOINT=https://your-account.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKETS=bucket1,bucket2
AWS_S3_FORCE_PATH_STYLE=true
PORT=3000
EOF

# 4. 测试运行
npm start -- --http
```

### 第四步：配置 systemd 服务（保持运行）

创建服务文件：

```bash
sudo nano /etc/systemd/system/s3-mcp.service
```

添加以下内容：

```ini
[Unit]
Description=S3 MCP Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/aws-s3-mcp
ExecStart=/usr/bin/node /home/your-username/aws-s3-mcp/dist/index.js --http
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
# 重载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start s3-mcp

# 设置开机自启
sudo systemctl enable s3-mcp

# 查看状态
sudo systemctl status s3-mcp

# 查看日志
sudo journalctl -u s3-mcp -f
```

### 第五步：安装 Cloudflare Tunnel

```bash
# 1. 下载并安装 cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# 2. 验证安装
cloudflared --version
```

### 第六步：配置 Cloudflare Tunnel

#### 6.1 登录 Cloudflare

```bash
cloudflared tunnel login
```

这会打开浏览器，选择你的域名并授权。

#### 6.2 创建 Tunnel

```bash
# 创建名为 s3-mcp-tunnel 的隧道
cloudflared tunnel create s3-mcp-tunnel

# 记下返回的 Tunnel ID，例如：
# Tunnel credentials written to /root/.cloudflared/abc123-def456-ghi789.json
# Tunnel ID: abc123-def456-ghi789
```

#### 6.3 配置 Tunnel

创建配置文件：

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

添加以下内容：

```yaml
tunnel: abc123-def456-ghi789  # 替换为你的 Tunnel ID
credentials-file: /root/.cloudflared/abc123-def456-ghi789.json  # 替换为你的凭证文件路径

ingress:
  # MCP 服务路由
  - hostname: s3-mcp.yourdomain.com  # 替换为你的域名
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: s3-mcp.yourdomain.com
  
  # 默认路由（必需）
  - service: http_status:404
```

#### 6.4 配置 DNS

```bash
# 将域名指向 Tunnel
cloudflared tunnel route dns s3-mcp-tunnel s3-mcp.yourdomain.com
```

#### 6.5 运行 Tunnel（测试）

```bash
cloudflared tunnel run s3-mcp-tunnel
```

如果一切正常，你应该能通过 `https://s3-mcp.yourdomain.com/health` 访问服务。

### 第七步：配置 Tunnel 为系统服务

```bash
# 安装为系统服务
sudo cloudflared service install

# 启动服务
sudo systemctl start cloudflared

# 设置开机自启
sudo systemctl enable cloudflared

# 查看状态
sudo systemctl status cloudflared
```

---

## 客户端配置

### CodeBuddy 配置示例

```json
{
  "mcpServers": {
    "aws-s3": {
      "url": "https://s3-mcp.yourdomain.com/mcp",
      "transport": "streamablehttp",
      "headers": [
        {"key": "S3-Region", "value": "auto"},
        {"key": "S3-Endpoint", "value": "https://your-account.r2.cloudflarestorage.com"},
        {"key": "S3-Access-Key-Id", "value": "your-access-key"},
        {"key": "S3-Secret-Access-Key", "value": "your-secret-key"},
        {"key": "S3-Buckets", "value": "adp,hunuyan3d"},
        {"key": "S3-Force-Path-Style", "value": "true"}
      ],
      "timeout": "30",
      "sse_read_timeout": "300"
    }
  }
}
```

---

## 故障排查

### 1. 检查 MCP 服务是否运行

```bash
sudo systemctl status s3-mcp
curl http://localhost:3000/health
```

### 2. 检查 Cloudflare Tunnel 状态

```bash
sudo systemctl status cloudflared
cloudflared tunnel info s3-mcp-tunnel
```

### 3. 查看日志

```bash
# MCP 服务日志
sudo journalctl -u s3-mcp -f

# Cloudflare Tunnel 日志
sudo journalctl -u cloudflared -f
```

### 4. 测试连接

```bash
# 测试健康检查
curl https://s3-mcp.yourdomain.com/health

# 测试 MCP 初始化
curl -X POST https://s3-mcp.yourdomain.com/mcp \
  -H "Content-Type: application/json" \
  -H "S3-Region: auto" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

---

## 安全建议

### 1. 防火墙配置

由于使用 Cloudflare Tunnel，你的 VPS 不需要开放任何公网端口：

```bash
# 只允许 SSH 访问
sudo ufw allow 22/tcp
sudo ufw enable
```

### 2. 添加认证（可选）

在 Cloudflare Tunnel 配置中添加 Access 策略：

1. 登录 Cloudflare Dashboard
2. 进入 Zero Trust > Access > Applications
3. 添加应用程序保护规则
4. 配置认证方式（Email OTP、Google、GitHub 等）

### 3. 限制访问来源

在 `config.yml` 中添加：

```yaml
ingress:
  - hostname: s3-mcp.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      # 限制特定 IP
      access:
        required:
          - allow:
              ip:
                - 1.2.3.4/32
```

---

## 高级配置

### 1. 多个 MCP 服务器

你可以在同一个 Tunnel 中配置多个服务：

```yaml
tunnel: abc123-def456-ghi789
credentials-file: /root/.cloudflared/abc123.json

ingress:
  - hostname: s3-mcp.yourdomain.com
    service: http://localhost:3000
  
  - hostname: another-mcp.yourdomain.com
    service: http://localhost:3001
  
  - service: http_status:404
```

### 2. 负载均衡

如果需要处理大量请求，可以运行多个 MCP 实例：

```yaml
ingress:
  - hostname: s3-mcp.yourdomain.com
    service: http://localhost:3000
    originRequest:
      # 连接池设置
      keepAliveConnections: 100
      keepAliveTimeout: 90s
```

### 3. 监控和告警

使用 Cloudflare Analytics 监控 Tunnel 流量和性能：

1. Cloudflare Dashboard > Zero Trust > Networks > Tunnels
2. 点击你的 Tunnel 查看统计信息
3. 配置告警规则

---

## 成本估算

### VPS 成本
- **轻量级**：阿里云/腾讯云轻量应用服务器，约 ¥24-50/月
- **标准型**：1核2G 配置，约 ¥50-100/月

### Cloudflare 成本
- **Tunnel**: 完全免费 ✅
- **Zero Trust (Access)**: 免费套餐支持 50 个用户 ✅

**总成本：约 ¥30-100/月**（仅 VPS 费用）

---

## 备选方案

如果你需要更简单的部署，也可以考虑：

### 方案二：Docker + VPS + Cloudflare Tunnel

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh

# 2. 运行 MCP 服务器
docker run -d --name s3-mcp \
  -p 3000:3000 \
  --env-file .env \
  --restart always \
  aws-s3-mcp --http

# 3. 配置 Cloudflare Tunnel（同上）
```

### 方案三：使用其他服务商

如果 VPS 对你来说太复杂，可以考虑：
- **Railway.app** - 支持 Node.js，免费额度
- **Render.com** - 支持 WebSocket，免费层
- **Fly.io** - 全球分布式部署

这些平台都支持 Node.js 应用，但可能有一些限制（如休眠机制、流量限制等）。

---

## 总结

使用 **VPS + Cloudflare Tunnel** 是部署 MCP 服务器的最佳实践：
- ✅ 稳定可靠
- ✅ 免费 HTTPS
- ✅ 全球加速
- ✅ 安全保护
- ✅ 易于维护

按照本指南操作，你的 S3 MCP 服务器将在几分钟内通过 Cloudflare 安全地暴露到互联网！🚀
