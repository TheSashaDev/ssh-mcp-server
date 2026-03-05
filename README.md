# ssh-mcp-server

[![npm](https://img.shields.io/npm/v/@thesashadev/ssh-mcp-server)](https://www.npmjs.com/package/@thesashadev/ssh-mcp-server)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

MCP server for executing commands, uploading and downloading files on remote servers via SSH. Zero-config for single servers — just pass credentials inline.

## Features

- **Command execution** — sync/async modes, timeout, background polling
- **Reliable file transfers** — 5 automatic fallback strategies
- **Multi-server** — easy switching with workspace-based auto-selection
- **AI-Native output** — ANSI stripped, binary detected, control chars removed
- **Zero-config mode** — pass server credentials directly in MCP config, no extra files needed
- **Fast** — SFTP session caching, connection pooling, 64-stream parallel transfers

## Tools

| Tool | Description |
|------|-------------|
| `ssh_servers` | List configured servers and their workspace bindings |
| `ssh_execute` | Run a shell command (sync or async with polling) |
| `ssh_upload` | Upload a local file to remote server |
| `ssh_download` | Download a remote file to local machine |

## Quick Start

### Zero-Config (Inline)
No files needed — pass server credentials directly in your AI tool's MCP config:
```json
{
  "ssh": {
    "command": "npx",
    "args": [
      "-y", "@thesashadev/ssh-mcp-server",
      "--host", "1.2.3.4",
      "--username", "ubuntu",
      "--password", "your-password"
    ]
  }
}
```

### With Config File
For multi-server setups, create `ssh-servers.json` in your working directory:
```json
{
  "servers": [
    {
      "id": "dev",
      "name": "Dev Server",
      "host": "1.2.3.4",
      "username": "ubuntu",
      "password": "your-password",
      "workspaces": ["D:\\projects\\my-app"]
    }
  ]
}
```
Then run:
```bash
npx -y @thesashadev/ssh-mcp-server
```

## 🔌 Client Integration

<details>
<summary><b>Claude Code (CLI)</b></summary>

**Single server:**
```bash
claude mcp add ssh -- npx -y @thesashadev/ssh-mcp-server --host 1.2.3.4 --username ubuntu --password secret
```

**Two servers:**
```bash
claude mcp add ssh -- npx -y @thesashadev/ssh-mcp-server \
  --host 1.2.3.4 --username ubuntu --password secret --id dev \
  --host 5.6.7.8 --username deploy --key ~/.ssh/id_rsa --id prod
```

**Or with config file:**
```bash
claude mcp add ssh -- npx -y @thesashadev/ssh-mcp-server
```
*(Place `ssh-servers.json` in your project root)*
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json`:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Single server:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  }
}
```

**Two servers:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

Open **Settings** → **Cursor Settings** → **MCP** → **+ Add New MCP Server**.

Or add to `~/.cursor/mcp.json`:

**Single server:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  }
}
```

**Two servers:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

Edit `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows):

**Single server:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  }
}
```

**Two servers:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Antigravity</b></summary>

Add to `mcp_config.json`:

**Single server:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  }
}
```

**Two servers:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b></summary>

Add to `codex.toml`:

**Single server:**
```toml
[mcp_servers."ssh"]
command = "npx"
args = [
  "-y", "@thesashadev/ssh-mcp-server",
  "--host", "1.2.3.4",
  "--username", "ubuntu",
  "--password", "secret"
]
enabled = true
```

**Two servers:**
```toml
[mcp_servers."ssh"]
command = "npx"
args = [
  "-y", "@thesashadev/ssh-mcp-server",
  "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
  "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
]
enabled = true
```
</details>

<details>
<summary><b>Cody (Sourcegraph)</b></summary>

Edit `~/.config/cody/mcp_servers.json`:

**Single server:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  }
}
```

**Two servers:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Continue.dev</b></summary>

Add to `.continue/config.json`:

**Single server:**
```json
{
  "mcpServers": [
    {
      "name": "ssh",
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4",
        "--username", "ubuntu",
        "--password", "secret"
      ]
    }
  ]
}
```

**Two servers:**
```json
{
  "mcpServers": [
    {
      "name": "ssh",
      "command": "npx",
      "args": [
        "-y", "@thesashadev/ssh-mcp-server",
        "--host", "1.2.3.4", "--username", "ubuntu", "--password", "secret", "--id", "dev",
        "--host", "5.6.7.8", "--username", "deploy", "--key", "~/.ssh/id_rsa", "--id", "prod"
      ]
    }
  ]
}
```
</details>

## Configuration

Three ways to configure servers (in priority order):

### 1. CLI Arguments (Zero-Config)
Pass directly in your MCP config args:
```
--host 1.2.3.4 --username ubuntu --password secret
--host 1.2.3.4 --username deploy --key ~/.ssh/id_rsa
```

| Arg | Description |
|-----|-------------|
| `--host` | SSH host (starts a new server block) |
| `--port` | SSH port (default: 22) |
| `--username` | SSH user |
| `--password` | Password auth |
| `--key` | Path to private key |
| `--passphrase` | Key passphrase |
| `--id` | Server ID (default: "default") |
| `--name` | Display name |
| `--remote-dir` | Default remote directory |
| `--workspace` | Local directory binding |

Multiple servers: repeat `--host` blocks:
```
--host 1.2.3.4 --username dev --password pass1 --id dev
--host 5.6.7.8 --username prod --key ~/.ssh/id_rsa --id prod
```

### 2. Environment Variables
For single-server setups via env:
```
SSH_HOST=1.2.3.4 SSH_USER=ubuntu SSH_PASSWORD=secret
```

| Env Var | Description |
|---------|-------------|
| `SSH_HOST` | SSH host |
| `SSH_PORT` | SSH port |
| `SSH_USER` | Username |
| `SSH_PASSWORD` | Password |
| `SSH_KEY` | Private key path |
| `SSH_PASSPHRASE` | Key passphrase |
| `SSH_REMOTE_DIR` | Default remote dir |
| `SSH_WORKSPACE` | Local workspace |

### 3. Config File (`ssh-servers.json`)
For complex multi-server setups. Looked up in: current directory → package directory.

```json
{
  "servers": [
    {
      "id": "dev",
      "host": "1.2.3.4",
      "username": "ubuntu",
      "password": "secret",
      "workspaces": ["D:\\projects\\my-app"]
    },
    {
      "id": "prod",
      "host": "5.6.7.8",
      "username": "deploy",
      "privateKeyPath": "~/.ssh/id_rsa",
      "workspaces": ["D:\\projects\\production"]
    }
  ]
}
```

## License

AGPL-3.0
