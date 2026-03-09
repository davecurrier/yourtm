# YourTM Built-in Version Control

## Overview

Git-like version control built directly into YourTM, storing source code in the cloud. Enables collaboration without requiring git knowledge or repository access.

**Key Value Props:**
- Marketers can version control without learning git
- Agencies get access with a single token - no repo invites needed
- Complete project history lives with the container
- Works alongside git (doesn't replace it, complements it)

---

## Commands

### `ytm clone <container-id>`
Download a container's full source to local machine.

```bash
$ ytm clone YTM-ABC123
Authenticating...
Cloning YTM-ABC123 (My E-commerce Site)...
  Downloading tags (12 files)...
  Downloading triggers (5 files)...
  Downloading variables (8 files)...
  Downloading zones (3 files)...
  Writing yourtm.config.ts...
Done! Project cloned to ./my-ecommerce-site

$ cd my-ecommerce-site && ls
yourtm/
yourtm.config.ts
.yourtmrc  # Contains container ID and remote info
```

### `ytm push`
Upload local changes to remote. Creates a new version.

```bash
$ ytm push
Comparing local and remote...
  Modified: tags/ga4/pageview.ts
  Added: tags/tiktok/purchase.ts
  Deleted: tags/old-pixel.ts

Creating version v24...
Uploading 3 files...
Done! Pushed to YTM-ABC123 (v24)

# With message
$ ytm push -m "Added TikTok purchase tracking"
```

### `ytm pull`
Download latest changes from remote.

```bash
$ ytm pull
Fetching from YTM-ABC123...
  Updated: tags/meta/pixel.ts
  Updated: variables/user-id.ts
Done! Updated to v25
```

### `ytm branch <name>`
Create a new branch for isolated changes.

```bash
$ ytm branch black-friday-tags
Created branch 'black-friday-tags' from 'main' (v24)
Switched to branch 'black-friday-tags'
```

### `ytm checkout <branch>`
Switch between branches.

```bash
$ ytm checkout main
Switched to branch 'main' (v24)

$ ytm checkout black-friday-tags
Switched to branch 'black-friday-tags' (v3)
```

### `ytm branches`
List all branches.

```bash
$ ytm branches
* main (v24) - production
  black-friday-tags (v3)
  agency-updates (v7)
  test-new-pixel (v1)
```

### `ytm log`
Show version history.

```bash
$ ytm log
v24 (current) - 2 hours ago
  "Added TikTok purchase tracking"
  by dave@company.com

v23 - 1 day ago
  "Fixed GA4 user ID parameter"
  by agency@partner.com

v22 - 3 days ago
  "Initial Meta CAPI setup"
  by dave@company.com

# Show specific number
$ ytm log -n 5
```

### `ytm diff`
Show changes between local and remote (or between versions).

```bash
$ ytm diff
Modified: tags/ga4/pageview.ts
  - page_title: document.title,
  + page_title: pageTitle.getValue(ctx),

$ ytm diff v22 v24
# Shows all changes between versions
```

### `ytm revert <version>`
Revert to a previous version.

```bash
$ ytm revert v22
Reverting to v22...
This will create a new version (v25) with v22's content.
Continue? (y/n) y
Done! Created v25 (reverted from v22)
```

---

## Access Tokens

### Generate Token
```bash
$ ytm token create
Token name: agency-readonly
Permissions:
  [x] Read (clone, pull)
  [ ] Write (push)
  [ ] Admin (branches, delete)
Expires: 90 days

Created token: ytm_tk_abc123xyz...
Share this with your collaborator. They can use:
  ytm login ytm_tk_abc123xyz
  ytm clone YTM-ABC123
```

### Token Management
```bash
$ ytm token list
NAME              PERMISSIONS   CREATED       LAST USED     EXPIRES
agency-readonly   read          Mar 1, 2024   Mar 5, 2024   May 30, 2024
dev-team          read,write    Feb 15, 2024  Mar 6, 2024   Never

$ ytm token revoke agency-readonly
Revoked token 'agency-readonly'
```

### Agency Workflow
```bash
# Agency receives token from client
$ ytm login ytm_tk_abc123xyz
Authenticated! You have read access to:
  - YTM-ABC123 (Client E-commerce Site)

$ ytm clone YTM-ABC123
Cloning...
Done!

# If they have write access:
$ ytm push -m "Updated conversion tracking"
Pushed v25
```

---

## Storage Architecture

### R2 Bucket Structure
```
yourtm-source/
├── YTM-ABC123/
│   ├── branches/
│   │   ├── main/
│   │   │   ├── HEAD (points to v24)
│   │   │   └── versions/
│   │   │       ├── v1/
│   │   │       │   ├── manifest.json
│   │   │       │   └── source.tar.gz
│   │   │       ├── v2/
│   │   │       └── v24/
│   │   └── black-friday-tags/
│   │       ├── HEAD (points to v3)
│   │       └── versions/
│   │           └── v3/
│   └── metadata.json
└── YTM-DEF456/
    └── ...
```

### KV Metadata (Fast Lookups)
```javascript
// Key: container:YTM-ABC123:meta
{
  "name": "My E-commerce Site",
  "owner": "user_123",
  "created": "2024-01-15T...",
  "defaultBranch": "main",
  "branches": ["main", "black-friday-tags", "agency-updates"]
}

// Key: container:YTM-ABC123:branch:main
{
  "head": "v24",
  "versions": [
    { "id": "v24", "message": "Added TikTok...", "author": "dave@...", "timestamp": "..." },
    { "id": "v23", "message": "Fixed GA4...", "author": "agency@...", "timestamp": "..." }
  ]
}

// Key: token:ytm_tk_abc123xyz
{
  "name": "agency-readonly",
  "containers": ["YTM-ABC123"],
  "permissions": ["read"],
  "created": "2024-03-01T...",
  "expires": "2024-05-30T..."
}
```

### manifest.json (Per Version)
```javascript
{
  "version": "v24",
  "parent": "v23",
  "branch": "main",
  "timestamp": "2024-03-06T16:45:00Z",
  "author": {
    "email": "dave@company.com",
    "name": "Dave"
  },
  "message": "Added TikTok purchase tracking",
  "files": {
    "yourtm/tags/ga4/pageview.ts": { "hash": "abc123", "size": 1240 },
    "yourtm/tags/tiktok/purchase.ts": { "hash": "def456", "size": 890 },
    "yourtm/variables/page-title.ts": { "hash": "ghi789", "size": 320 },
    "yourtm.config.ts": { "hash": "jkl012", "size": 450 }
  },
  "stats": {
    "tags": 12,
    "triggers": 5,
    "variables": 8,
    "zones": 3
  }
}
```

---

## Smart Features

### Auto-conflict Detection
```bash
$ ytm push
Error: Remote has newer changes (v25)

Your version: v24
Remote version: v25

Run 'ytm pull' first, then push your changes.
Or use 'ytm push --force' to overwrite (not recommended).
```

### Merge Preview
```bash
$ ytm pull
Fetching v25...

Incoming changes:
  Modified: tags/ga4/config.ts

Your local changes:
  Modified: tags/ga4/config.ts  # CONFLICT

Auto-merge not possible. Options:
  1. Keep yours: ytm pull --ours
  2. Keep theirs: ytm pull --theirs
  3. Manual merge: Files saved to tags/ga4/config.ts.conflict
```

### Publish Integration
```bash
# Push and deploy in one command
$ ytm push --publish staging
Pushed v25
Building...
Deploying to staging...
Done! Live at: https://cdn.yourtm.dev/YTM-ABC123/staging/

# Or keep them separate
$ ytm push
$ ytm publish staging
```

---

## .yourtmrc File

Created on clone, tracks remote connection:

```json
{
  "containerId": "YTM-ABC123",
  "remote": "https://api.yourtm.dev",
  "branch": "main",
  "lastPull": "2024-03-06T16:45:00Z",
  "lastPush": "2024-03-06T14:30:00Z"
}
```

---

## Implementation Phases

### Phase 1: Core Commands (MVP)
- [ ] `ytm push` - Upload source to R2
- [ ] `ytm clone` - Download source from R2
- [ ] `ytm pull` - Sync latest changes
- [ ] `ytm log` - View version history
- [ ] Linear versioning (v1, v2, v3... no branches yet)

### Phase 2: Authentication
- [ ] `ytm login` - Authenticate with token
- [ ] `ytm token create` - Generate access tokens
- [ ] `ytm token list/revoke` - Manage tokens
- [ ] Permission scoping (read/write/admin)

### Phase 3: Branching
- [ ] `ytm branch` - Create branches
- [ ] `ytm checkout` - Switch branches
- [ ] `ytm branches` - List branches
- [ ] `ytm merge` - Merge branches

### Phase 4: Collaboration
- [ ] Conflict detection
- [ ] `ytm diff` - Visual diff
- [ ] `ytm blame` - Who changed what
- [ ] Activity feed / notifications

---

## Why This Over Git?

| Feature | Git | YourTM VC |
|---------|-----|-----------|
| Learning curve | Steep | Simple (5 commands) |
| Access sharing | Repo invites, SSH keys | Single token |
| Hosting required | GitHub/GitLab account | Built-in |
| Deploy integration | CI/CD setup | `ytm push --publish` |
| Tag-specific features | None | Audit, validation, preview |
| Non-dev friendly | No | Yes |

**For technical teams:** Use git for your workflow, `ytm push` to deploy.
**For marketing teams:** Use ytm commands exclusively, skip git entirely.
**For agencies:** Get a token, clone, make changes, push. No repo access needed.
