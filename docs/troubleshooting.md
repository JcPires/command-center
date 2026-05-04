# Dépannage

## Le serveur ne démarre pas

```bash
./cc doctor              # diagnostic complet
tail -50 logs/server.err.log
```

Causes fréquentes :

- **Port occupé** : `Errno 48 address already in use`. Vérifier `lsof -i :8765`. Tuer le processus, ou changer le port avec `CC_PORT=8766 ./cc start`.
- **Module not found 'scripts'** : tu as lancé `cc start` depuis un autre répertoire que le projet. Toujours `cd` dans le répertoire du projet (ou utiliser le chemin absolu vers `./cc`).
- **Venv cassé** : `rm -rf .venv && ./install.sh --yes` rebuilde tout.

## L'UI ne reflète pas mes changements

Le serveur Python lit `ui/dist/index.html` **au démarrage** et le met en cache. Après un build :

```bash
cd ui && npx vite build
./cc restart
```

Si les chunks JS/CSS apparaissent en 404 dans le devtools, c'est exactement ce problème — restart du serveur.

## Pas de données dans le dashboard

```bash
./cc sync                       # force un scrape JSONL
curl -s http://127.0.0.1:8765/api/summary
```

- Vérifier que `~/.claude/projects/` contient des fichiers JSONL récents.
- `CC_PROJECTS_DIR` peut pointer ailleurs : voir `.env`.
- La fenêtre "live" est de 300 s par défaut (`CC_LIVE_WINDOW`) — un JSONL non touché depuis 5 min n'apparaît pas dans Sessions en direct.

## OTEL ne remonte rien

```bash
./cc setup otel                 # re-applique le patch ~/.claude/settings.json
```

Vérifier dans `~/.claude/settings.json` :

```json
{
  "otel": {
    "exporter": "http",
    "endpoint": "http://127.0.0.1:8765"
  }
}
```

Redémarrer Claude Code après modification de `settings.json`. Pour vérifier le flux : ouvrir `/activity` dans le dashboard et utiliser Claude Code — les events doivent apparaître en temps réel.

## "Send a follow-up" n'a aucun effet

C'est attendu si la session **n'a pas été lancée par le dispatcher Mission Control**. Le dashboard écrit dans `.tmp/mission-control-queue/<sid>.jsonl` mais seul le dispatcher draine ce fichier dans le stdin de la session.

Pour piloter depuis le dashboard :
- Mettre une tâche en file via le Centre de contrôle (`POST /api/tasks`).
- Le dispatcher la spawn au prochain tick (120 s par défaut). La session devient `dispatcher_managed` et acceptera les suivis.

Le drawer affiche un banner "Lecture seule" pour les sessions IDE/CLI : c'est explicite, pas un bug.

## Bordures blanches/visibles en mode sombre

Si tu vois des bordures blanches "marquées" au lieu de hairlines fines :

- Le composant utilise probablement `border border-border/70` (1 px) au lieu de `border-[0.5px] border-hairline` (0.5 px).
- Voir `docs/extending.md` § Conventions.

Le panel Tweaks > Bordures permet aussi de baisser à `none` si on veut un look "panel sans contour".

## La heatmap horaire est vide

- Vérifier qu'il y a des `tool_calls` dans la base : `sqlite3 data/command-centre.db 'SELECT COUNT(*) FROM tool_calls WHERE ts >= datetime("now","-7 days")'`.
- Sans events OTEL, les `tool_calls` ne sont pas peuplés. `./cc setup otel` est requis.

## La sparkline tokens est plate

Avec très peu de jours actifs et un pic énorme (cache_read), l'échelle linéaire écrase tout. Le chart utilise une échelle racine carrée pour atténuer ça. Si ce n'est toujours pas lisible : toggle **CACHE** off pour voir input/output isolés.

## "Internal Server Error" sur `/api/tools/latency/series`

Bug connu fixé : un paramètre nommé `range` shadowait le builtin Python `range()` dans la closure. Si tu portes du code similaire, alias le builtin avec `import builtins; builtins.range(...)`.

## Le panel Tweaks ne se ferme pas

Click hors du panel ou touche `Escape`. Si le toggle `Animations` est off, la transition disparaît mais le panel se ferme bien.

## Reset complet

```bash
./cc stop
rm -rf .venv ui/node_modules ui/dist data/*.db logs/*
./install.sh --yes
```

Ça repart d'une install propre — la base SQLite est régénérée vide, prochain `./cc sync` la re-peuple à partir des JSONL existants.

## Logs utiles

```bash
./cc logs                                            # tail -f sur tout
tail -f logs/server.{out,err}.log                    # serveur uniquement
tail -f logs/mission-control.{out,err}.log           # dispatcher uniquement
sqlite3 data/command-centre.db '.schema'             # introspection DB
sqlite3 data/command-centre.db 'SELECT * FROM ops_tasks ORDER BY id DESC LIMIT 5'
```
