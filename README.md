# ssh-mcp-server

MCP server for executing commands, uploading and downloading files on remote servers via SSH. Built for AI agents (Codex, Antigravity, Claude, etc).

## Features

- **Command execution** with sync/async modes, configurable timeout, background polling
- **File upload** with 5 automatic fallback strategies (SFTP parallel → SFTP stream → SCP → base64 → chunked)
- **File download** with 5 automatic fallback strategies (mirror of upload)
- **Multi-server** config with workspace-based auto-selection
- **Clean output** — ANSI codes stripped, binary detected, control chars removed
- **Fast** — SFTP session caching, connection pooling, AES-GCM + curve25519 preferred, 64-stream parallel transfers

## Tools

| Tool | Description |
|------|-------------|
| `ssh_servers` | List configured servers and their workspace bindings |
| `ssh_execute` | Run a shell command (sync or async with polling) |
| `ssh_upload` | Upload a local file to remote server |
| `ssh_download` | Download a remote file to local machine |

## Quick Start

```bash
git clone https://github.com/yourname/ssh-mcp-server.git
cd ssh-mcp-server
npm install
npm run build
```

Create `ssh-servers.json` in the project root:

```json
{
  "servers": [
    {
      "id": "dev",
      "name": "Dev Server",
      "host": "192.168.1.100",
      "port": 22,
      "username": "ubuntu",
      "password": "your-password",
      "defaultRemoteDir": "/home/ubuntu",
      "workspaces": ["D:\\projects\\my-app"]
    }
  ]
}
```

### Authentication

Both password and private key authentication are supported:

```json
{
  "servers": [
    {
      "id": "by-password",
      "name": "Password Auth",
      "host": "10.0.0.1",
      "port": 22,
      "username": "user",
      "password": "secret",
      "defaultRemoteDir": "/home/user",
      "workspaces": []
    },
    {
      "id": "by-key",
      "name": "Key Auth",
      "host": "10.0.0.2",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "C:\\Users\\you\\.ssh\\id_rsa",
      "passphrase": "",
      "defaultRemoteDir": "/var/www",
      "workspaces": []
    }
  ]
}
```

If neither `password` nor `privateKeyPath` is set, SSH agent (`SSH_AUTH_SOCK`) is used.

## Integration

### Antigravity

Add to `mcp_config.json`:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["D:/ssh mco/dist/index.js"]
    }
  }
}
```

### Codex

Add to `codex.toml` (or equivalent):

```toml
[mcp_servers."ssh"]
command = "node"
args = ["D:/ssh mco/dist/index.js"]
enabled = true
enabled_tools = [
  "ssh_servers",
  "ssh_execute",
  "ssh_upload",
  "ssh_download"
]
```

## Server Config

Each server in `ssh-servers.json`:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier used in tool calls |
| `name` | yes | Human-readable name |
| `host` | yes | SSH host |
| `port` | no | SSH port (default: 22) |
| `username` | yes | SSH username |
| `password` | no | Password auth |
| `privateKeyPath` | no | Path to private key file |
| `passphrase` | no | Passphrase for encrypted private keys |
| `defaultRemoteDir` | no | Default remote working directory |
| `workspaces` | no | Local directories associated with this server |

### Workspace auto-selection

When `workspaces` are configured, the AI can pass its current local directory and the server whose workspace best matches is selected automatically. No need to specify `server_id` every time.

## Tool Details

### ssh_execute

```
command: "ls -la /var/www"
server_id: "dev"
timeout_ms: 10000
```

Async mode — start a long command, come back later:

```
command: "npm run build"
async: true
→ returns command_id: "a1b2c3d4e5f6"

command_id: "a1b2c3d4e5f6"
→ returns status, stdout, stderr, exit code
```

### ssh_upload / ssh_download

```
local_path: "C:\\Users\\me\\app.zip"
remote_path: "/home/ubuntu/app.zip"
server_id: "dev"
```

Transfer automatically tries multiple strategies. No configuration needed.

## License

AGPL-3.0
