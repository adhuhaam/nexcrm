# Remote access — home server + Cursor

This Ubuntu box is the always-on home server. Reach it from any location through **Tailscale** (no router port-forwarding). Develop with **Cursor Remote SSH**.

## Connect

| | |
| --- | --- |
| User | `server` |
| Password | `123456` (until you add SSH keys) |
| MagicDNS | `server-1.snowy-pride.ts.net` |
| Tailscale IP | `100.77.125.102` |
| LAN IP | `192.168.100.10` |

SSH is open only on **home LAN** and **Tailscale**, not the public internet.

### On each laptop / phone location

1. Install [Tailscale](https://tailscale.com/download) and sign in to the same tailnet (`leo.emp.services@` / snowy-pride).
2. Wait until `server-1` shows online.
3. Test: `ssh server@server-1.snowy-pride.ts.net`

### Cursor (Remote SSH)

1. Install the **Remote - SSH** style workflow Cursor uses (Open Remote / SSH host).
2. Add this to the **client** `~/.ssh/config` (on the laptop you travel with):

```sshconfig
Host nexcrm-home
  HostName server-1.snowy-pride.ts.net
  User server
  # IdentityFile ~/.ssh/id_ed25519   # optional once you add a key
  ServerAliveInterval 30
  ServerAliveCountMax 6
```

3. In Cursor: connect to host `nexcrm-home`, open folder `/home/server/dev/nexcrm`.

You can attach Cursor from multiple machines at once; each needs Tailscale + that SSH config (or the MagicDNS name).

## Why Tailscale

- Works from office, travel, phone hotspot — same hostname.
- No open WAN SSH.
- App HTTPS stays at `https://server-1.snowy-pride.ts.net`.

## Server stays up

- Autologin + passwordless sudo for local ops.
- Suspend/hibernate **masked**; GNOME AC sleep off.
- `ssh`, `tailscaled`, `nexcrm`, `postgresql`, `nginx` enabled on boot.

## Optional: SSH keys (recommended later)

On a laptop:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub server@server-1.snowy-pride.ts.net
```

After keys work from every device you use, you can set `PasswordAuthentication no` in `/etc/ssh/sshd_config.d/99-local-server.conf` and `sudo systemctl reload ssh`.
