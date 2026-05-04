# Guide utilisateur

Le dashboard a trois pages : **Commande**, **Activité**, **Compétences & MCP**. Une barre de status système collante en haut et un panel **Tweaks** flottant en bas-droite.

## Navigation

- **⌘K** ouvre la palette de commandes (recherche + sauts rapides).
- L'item actif de la nav porte un point vert à droite.
- Le toggle thème (☀/☾), la langue (FR/EN) et la palette de commandes vivent dans la barre du haut.

## Page Commande

Vue principale, organisée en sections dépliables.

### Aperçu — KPI hero row

Quatre cartes :

| Carte | Valeur | Source |
|---|---|---|
| Sessions aujourd'hui | nombre de sessions de la journée locale | `sessions` table, agrégation jour |
| Tokens 24h | total cumulé `input + output + cache_*` | idem |
| Appels d'outils | count `tool_calls` du jour | idem |
| Erreurs | `error_count` cumulé | idem |

Chaque carte affiche :
- une **valeur** brute,
- un **delta %** vs. la veille (calculé côté serveur, pas affiché si pas de baseline),
- une **sparkline 7 jours** réelle,
- un **suffix** explicite (ex. `1 en direct` si une session live, `aucune hier` sinon).

La hero card a une pill `EN DIRECT` quand au moins une session est live.

### Suivi & flux

- **Heatmap horaire (7j)** — grille 7 lignes × 24 colonnes (Dim → Sam). Couleur quantifiée en 6 niveaux selon l'intensité d'appels d'outils dans la tranche horaire. Au survol : `dimanche · 14h–15h · 259 appels`. Légende top-right : Calme · Moyen · Intense (gradient bleu→magenta).
- **Tokens · 14 j** — barres empilées sur 14 jours :
  - 3 segments par jour : `cache` (violet), `input` (cyan), `output` (orange).
  - **Échelle racine carrée** pour rendre lisibles les jours faibles malgré les pics.
  - **Toggle CACHE** : exclut le segment cache pour voir input/output sans qu'ils soient écrasés (l'échelle Y se recalibre).
  - Tooltip au survol : breakdown complet du jour avec %.
  - Légende cumulée en bas : `CACHE 3.8B 99% · INPUT 103K 0% · OUTPUT 19.7M 1% · total 3.8B`.
- **Sessions en direct** — liste compacte des sessions actives ; cliquer ouvre un drawer avec timeline outils + zone de suivi.

### Observabilité

- **Routes · API & MCP** — table des outils avec `AVG / P50 / P95 / P99` (vraies valeurs SQL, plus d'approximation), badge `OK/WARN/ERR`, sparkline trend p95 quotidien + delta % vs. fenêtre précédente. Tooltip sur la colonne Trend explique la lecture.
- **Distribution des sessions** — donut 4 segments : Réussites / Avec warns / Erreurs / Annulées. Compte + % par segment, total au centre.
- **Sous-agents · Distribution des agents** — top des prompts qui partent en sous-tâche (Agent tool).
- **Sortie · Productivité** — commits / PRs / lignes de code via les compteurs OTEL `claude_code.*`.
- **Taux de succès du cache** — `cache_read / (input + cache_read + cache_create)`. Sparkline avec couleur **par seuil** : vert ≥70%, orange 50-70%, rouge <50%. Cible 70% en pointillés.
- **Hooks · Activité** — déclenchements des hooks `~/.claude/settings.json` (paired/orphans, p95 de latence).
- **Projets · Par répertoire** — sessions, tools, tokens groupés par `cwd`.
- **Modifications · Taux d'acceptation** — Edit/Write d'après les events `tool_decision`.
- **Pression système (7j)** — erreurs API, retry exhaustions, compactions de contexte sur 7 jours. Tout >0 mérite un coup d'œil.

### Sessions

Table complète avec :
- Recherche par titre/path
- **Grouping** : Aucun · Projet · Modèle (segmented primary)
- **Range** : Aujourd'hui · 7J · 30J
- Colonnes : Titre · Modèle (badge coloré opus/sonnet/haiku) · Tokens · Volume (barre) · Tendance (sparkline réelle de la latence outils par bucket) · Erreurs · Démarrée

### Humain dans la boucle

- **Décisions en attente** — décisions HITL injectées par le dispatcher (markers `DECISION:` dans le stream). Un bouton "Répondre" enqueue la réponse dans le pipe stdin de la session.
- **Boîte de réception** — markers `INBOX:` capturés. Marquer comme lu, répondre.

### Centre de contrôle

- **File de tâches** — file Mission Control. "Mettre une tâche en file" lance le composer ; le dispatcher claim le job au prochain tick (120s par défaut).
- **Planifications** — schedules cron-like, déclenchent des tâches. NL parsing : "tous les jours à 9h".
- **Arrêt d'urgence** — bandeau rouge en bas. Tue tous les `claude -p` orchestrés par le dispatcher (PIDs trackés dans `.tmp/mission-control-queue/pids/`).

## Page Activité

- **Tendances · Activité quotidienne (1 an)** — heatmap calendrier façon GitHub : 53 colonnes × 7 lignes, cellules `aspect-square`, lue depuis `/api/activity/daily`. Tooltip au survol : `dimanche 26 avr 2026 · 89.5M tokens`.
- **Flux de télémétrie** — stream live des events OTEL (TOOL_DECISION, TOOL_RESULT, API_REQUEST), filtrable, pausable.
- **Toutes les sessions** — même table que dans la page Commande (composant partagé).

## Page Compétences & MCP

- **Serveurs MCP** — table avec p50/p95/max, error_rate, count d'appels. Cliquer une ligne déplie le détail per-tool.
- **Économie des skills** — répartition des tokens par modèle (proxy de coût).
- **Santé du contexte** — counters par environnement.
- **Registre** — liste des skills découverts dans `.claude/skills/` et `~/.claude/skills/`. Filtre par environnement, segmented `Auto/Revue/Manuel` pour changer le niveau d'autonomie d'un skill.

## Drawer session live

Cliquer une ligne dans **Sessions en direct** ou dans la table sessions ouvre un drawer (panneau latéral droit). Contenu :

- Header : titre + cwd + modèle + ID
- Tokens, erreurs, démarrée
- **Chronologie des outils** — flux temps réel via SSE (`/api/sessions/live/{sid}/stream`)
- **Envoyer un suivi** — textarea + bouton `Mettre le message en file`. Disponible **uniquement** si la session est `dispatcher_managed = true` (lancée par Mission Control). Pour les sessions IDE/CLI, un banner "Lecture seule" explique pourquoi le suivi ne sera pas délivré et pointe vers le Centre de contrôle.

## Panel Tweaks

Bouton flottant bas-droite (icône sliders). Tout est persisté en localStorage.

### Thème
- **Mode** : Sombre / Clair
- **Densité** : Compact / Régulier / Aéré (modifie row-height, padding, font-size de base)
- **Taille de texte** : 12-17px (root font-size, scale les utilities Tailwind en rem)
- **Rayon des cartes** : 0-28px (pilote `--radius-card`, toutes les `.card`/`rounded-card` héritent)
- **Échelle des chiffres KPI** : 36-84px (hero + standard cards proportionnels)

### Palette
8 palettes. Click un swatch pour switcher en live.

| Nom | Teinte | Usage |
|---|---|---|
| Aurora | violet/bleu | défaut, premium sobre |
| Citrus | orange | chaleureux |
| Forest | vert | techy/calme |
| Ocean | cyan/teal | aqua |
| Sunset | corail/magenta | vibrant |
| Lavender | mauve | doux |
| Ember | rouge/braise | énergique |
| Arctic | bleu pâle | minimal |

Chaque palette définit `--acc`, `--acc-2`, `--acc-3`, `--acc-grad`, `--acc-soft` plus `--on-acc` (clair ou sombre selon la luminance du gradient pour assurer le contraste texte).

### Style des cartes
- **Élévation** : Plat / Soft / Marqué (`box-shadow`)
- **Bordures** : Aucune / Fine / Marquée (couleur des hairlines)
- **Badges** : Soft (par défaut) / Outline / Solid — appliqué globalement via `body[data-badge]`, les `<Badge>` se mettent à jour en live (MutationObserver)
- **Hero KPI en gradient** : toggle, off → la hero card passe en surface neutre comme les autres
- **Lignes alternées (zebra)** : sur la table sessions

### Décor de fond
- **Halo de couleur** : 2 radial-gradients d'accent en haut de page
- **Grille de fond** : grille subtile 64×64
- **Grain (bruit)** : slider 0-50, overlay SVG `feTurbulence`
- **Animations** : on/off, ajoute `body.no-motion` qui désactive transitions et animations
