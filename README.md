# ssh-mcp-server

MCP server for executing commands, uploading and downloading files on remote servers via SSH. Optimized for AI agents (Claude Code, Cursor, Windsurf, Antigravity, etc).

## ✨ Features

- **Command execution** — sync/async modes, timeout, background polling
- **Reliable file transfers** — 5 automatic fallback strategies (SFTP parallel → SFTP stream → SCP → base64 → chunked)
- **Multi-server** — easy switching with workspace-based auto-selection
- **AI-Native output** — ANSI codes stripped, binary detected, control chars removed
- **Extreme Performance** — Cached sessions, connection pooling, 64-stream parallel transfers

## 🛠 Tools

| Tool | Description |
|------|-------------|
| `ssh_servers` | List configured servers and their workspace bindings |
| `ssh_execute` | Run a shell command (sync or async with polling) |
| `ssh_upload` | Upload a local file to remote server |
| `ssh_download` | Download a remote file to local machine |

## 🚀 Quick Start

1. **Clone & Build:**
```bash
git clone https://github.com/TheSashaDev/ssh-mcp-server.git
cd ssh-mcp-server
npm install
npm run build
```

2. **Configure Servers:**
Create `ssh-servers.json` in the project root:
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
*Supports password, private key (`privateKeyPath`), and SSH agent auth.*

## 🔌 Client Integration

Select your AI tool to see the setup guide:

<details>
<summary><b>🤖 Claude Code (CLI)</b></summary>

Run this command in your terminal:
```bash
claude mcp add ssh -- node "D:/ssh mco/dist/index.js"
```
Or manually add to `~/.config/claude/mcp_servers.json`:
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
</details>

<details>
<summary><b>🖥️ Claude Desktop</b></summary>

Edit your `claude_desktop_config.json`:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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
</details>

<details>
<summary><b>🖱️ Cursor</b></summary>

1. Go to **Settings** > **Cursor Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. Name: `ssh`. Type: `command`. 
4. Command:
```bash
node "D:/ssh mco/dist/index.js"
```
</details>

<details>
<summary><b>🏄 Windsurf</b></summary>

Edit `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows):

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
</details>

<details>
<summary><b>🛡️ Antigravity</b></summary>

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
</details>

<details>
<summary><b>🧠 Codex</b></summary>

Add to `codex.toml`:
```toml
[mcp_servers."ssh"]
command = "node"
args = ["D:/ssh mco/dist/index.js"]
enabled = true
```
</details>

<details>
<summary><b>🔍 Cody (Sourcegraph)</b></summary>

Edit `~/.config/cody/mcp_servers.json` (macOS/Linux) or `%USERPROFILE%\.config\cody\mcp_servers.json` (Windows):
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
</details>

<details>
<summary><b>🔁 Continue.dev</b></summary>

Add to your `.continue/config.json`:
```json
{
  "contextProviders": [
    {
      "name": "mcp",
      "params": {
        "mcpServers": {
          "ssh": {
            "command": "node",
            "args": ["D:/ssh mco/dist/index.js"]
          }
        }
      }
    }
  ]
}
```
</details>

## ⚙️ Server Config

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | ID used in tool calls |
| `host` | yes | SSH host |
| `username` | yes | SSH username |
| `password` | no | Password auth |
| `privateKeyPath`| no | Path to private key |
| `workspaces` | no | Local folders for auto-selection |

### Workspace Auto-Selection
When `workspaces` are set (e.g. `["D:\\projects\\my-app"]`), the AI automatically selects the correct server based on your current local directory. No manual `server_id` required!

## 📜 License

AGPL-3.0
