# Command Centre

Tableau de bord local pour Claude Code. Surveille tes sessions, tes coûts en tokens, l'état du cache et la santé du système ; pilote des tâches en file et envoie des suivis aux sessions actives.

100 % local : tout tourne sur `127.0.0.1`, la base SQLite vit dans `data/`, aucune donnée ne sort de ta machine.

```
┌──────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  Claude Code     │ ──▶ │  ~/.claude/...  │ ──▶ │  scripts/sync_*.py  │
│  (IDE/CLI)       │     │  JSONL + OTEL   │     │  → SQLite (data/)   │
└──────────────────┘     └─────────────────┘     └──────────┬──────────┘
                                                            │
        ┌───────────────────────────────────────────────────┤
        ▼                                                   ▼
┌──────────────────┐                            ┌────────────────────┐
│ FastAPI          │                            │ Mission Control    │
│ scripts/server   │ ◀── /api/sessions/* ──     │ dispatcher.py      │
│ port 8765        │                            │ (launchd, optionnel)│
└────────┬─────────┘                            └────────────────────┘
         │ /api/*
         ▼
┌──────────────────┐
│  React UI        │  http://127.0.0.1:8765
│  ui/dist         │
└──────────────────┘
```

## Démarrage rapide

```bash
git clone <repo> claude-dashboard
cd claude-dashboard
./install.sh           # interactif ; ./install.sh --yes pour tout accepter
./cc start             # démarre le serveur sur :8765
open http://127.0.0.1:8765
```

L'installer prend en charge le venv Python, les dépendances UI, le build, l'init de la base, l'enregistrement OTEL pour Claude Code et (optionnel) deux jobs launchd pour que serveur + dispatcher démarrent au login.

## Documentation

- **[Installation](docs/installation.md)** — prérequis, options de l'installer, désinstallation
- **[Guide utilisateur](docs/usage.md)** — chaque section/panel du dashboard expliquée
- **[Architecture](docs/architecture.md)** — comment le dashboard s'imbrique avec Claude Code
- **[Étendre](docs/extending.md)** — ajouter un panel, un endpoint, une palette, une feature
- **[Dépannage](docs/troubleshooting.md)** — problèmes courants

## Commandes

```bash
./cc start          # démarre le serveur FastAPI
./cc stop           # tue le serveur (et décharge launchd si actif)
./cc restart        # stop + start
./cc doctor         # diagnostique l'environnement
./cc setup otel     # (re)configure ~/.claude/settings.json pour la télémétrie
./cc sync           # rejoue le scrape JSONL → SQLite
./cc logs           # tail -f sur logs/*
```

## Stack

- **Backend** : Python 3.10+, FastAPI, SQLite, uvicorn
- **Frontend** : React 18, TypeScript, Vite, Tailwind, TanStack Router/Query
- **OS** : macOS (launchd) — Linux fonctionne sans launchd, pas de support Windows officiel
