# Installation

## Prérequis

- macOS (testé) ou Linux. Windows non supporté officiellement.
- Python 3.10+ (3.12 ou 3.14 idéal). Vérifier avec `python3 --version`.
- Node.js 18+ et npm. Vérifier avec `node --version`.
- Claude Code installé (`claude --version`).

## Installer

L'installer est idempotent — on peut le rejouer sans risque :

```bash
git clone <repo> claude-dashboard
cd claude-dashboard
./install.sh
```

Il enchaîne :

1. **Python** — détecte l'interpréteur (3.10 → 3.14) et crée un venv dans `.venv/`
2. **Layout** — crée `data/`, `logs/`, `.tmp/`
3. **Virtualenv** — installe `requirements.txt` (FastAPI, uvicorn, pydantic, mcp…)
4. **UI** — `npm install` puis `npm run build` dans `ui/`
5. **Configuration** — copie `.env.example → .env` si absent
6. **Database** — `python scripts/db.py` pour appliquer les migrations
7. **OTEL** *(optionnel)* — patche `~/.claude/settings.json` pour activer la télémétrie OTEL exportée vers le dashboard
8. **launchd** *(optionnel, macOS)* — installe `com.commandcentre.server` et `com.commandcentre.mission-control` dans `~/Library/LaunchAgents/`
9. **Starting server** — démarre l'API sur `http://127.0.0.1:8765`

## Options de l'installer

```bash
./install.sh --yes              # non-interactif, accepte tous les défauts
./install.sh --no-otel          # saute la configuration de ~/.claude/settings.json
./install.sh --no-launchd       # n'installe pas les jobs launchd
./install.sh --no-start         # ne démarre pas le serveur à la fin
./install.sh --port 8765        # change le port d'écoute (défaut 8765)
./install.sh --into <chemin>    # installe dans un autre répertoire
```

Variables d'environnement reconnues (voir `.env`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `CC_PORT` | `8765` | Port HTTP du serveur |
| `CC_HOST` | `127.0.0.1` | Interface d'écoute |
| `CC_PROJECTS_DIR` | `~/.claude/projects` | Répertoire scanné pour les sessions JSONL |
| `CC_LIVE_WINDOW` | `300` (s) | Une session est "live" si son JSONL a été modifié dans cette fenêtre |
| `MISSION_CONTROL_DEFAULT_MODEL` | `claude-sonnet-4-6` | Modèle par défaut pour les tâches du dispatcher |

## Vérification

```bash
./cc doctor          # diagnostic complet (python, node, db, OTEL, launchd…)
curl -s http://127.0.0.1:8765/api/health     # → {"ok": true}
open http://127.0.0.1:8765
```

## Mises à jour

```bash
git pull
./install.sh --yes   # rebuild UI, applique les migrations DB, redémarre
```

## Désinstallation

```bash
./cc stop                                                  # arrête tout
launchctl unload ~/Library/LaunchAgents/com.commandcentre.*  # si installés
rm ~/Library/LaunchAgents/com.commandcentre.*.plist
rm -rf .venv ui/node_modules ui/dist data/*.db logs/*
```

Pour désactiver OTEL côté Claude Code, éditer `~/.claude/settings.json` et retirer le bloc `otel` ajouté par `scripts/setup_otel.py` — ou rejouer `./install.sh --no-otel` pour le supprimer proprement.

## Structure d'install

Après installation, le dépôt ressemble à :

```
claude-dashboard/
├── cc                          # script lanceur
├── install.sh
├── requirements.txt
├── .env                        # config locale
├── .venv/                      # virtualenv Python
├── data/
│   └── command-centre.db       # SQLite
├── logs/
│   ├── server.{out,err}.log
│   └── mission-control.{out,err}.log
├── .tmp/
│   └── mission-control-queue/  # IPC dispatcher (jsonl + pids)
├── scripts/
│   ├── server.py               # FastAPI
│   ├── db.py
│   ├── live_sessions.py
│   ├── sync_sessions.py
│   ├── sync_skills.py
│   ├── doctor.py
│   ├── setup_otel.py
│   ├── llm.py
│   ├── mcp_analyzer.py
│   └── mcp_measure.py
├── .claude/skills/mission-control/scripts/
│   ├── dispatcher.py           # spawne `claude -p ...` pour les tâches
│   ├── heartbeat.py            # cron-like, claim une tâche pending
│   ├── session_state_hook.py
│   ├── skill_router.py
│   └── task_tracker.py
├── templates/launchd/
│   ├── com.commandcentre.server.plist.template
│   └── com.commandcentre.mission-control.plist.template
└── ui/
    ├── src/                    # source React
    └── dist/                   # build production servi par FastAPI
```
