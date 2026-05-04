# Étendre le dashboard

Recettes pratiques pour ajouter ou modifier une feature.

## Boucle de dev

Deux options :

### A. Build + restart (production-like)

```bash
cd ui && npx vite build
# le serveur Python sert ui/dist
./cc restart
```

C'est ce que fait l'installer. Bon pour valider un build complet, plus lent.

### B. Vite dev server (HMR)

```bash
cd ui && npm run dev    # :5173 avec HMR
# en parallèle, le serveur Python tourne sur :8765
```

Pour que les calls `/api/*` depuis :5173 atteignent :8765, soit :
- ouvrir directement `http://127.0.0.1:8765/` (Vite n'est plus en jeu, il faut rebuild),
- soit ajouter un proxy dans `ui/vite.config.ts`.

Pour la majorité des changements d'UI, l'option **B** est plus rapide (recharge instantanée).

Toujours :
```bash
cd ui && ./node_modules/.bin/tsc --noEmit   # type check
```

## Ajouter un panel

Mettons qu'on veuille un panel "Coût mensuel" sur la page Commande.

### 1. Backend (si nouvelle data)

Ajouter une route dans `scripts/server.py` :

```python
@app.get("/api/usage/monthly-cost")
async def usage_monthly_cost(months: int = 12) -> dict[str, Any]:
    months = max(1, min(months, 24))
    def _q():
        with connect() as conn:
            rows = conn.execute(
                """SELECT strftime('%Y-%m', date) AS month,
                          SUM(...) AS cost_usd
                   FROM token_usage
                   WHERE date >= DATE('now', ?)
                   GROUP BY month
                   ORDER BY month""",
                (f"-{months} months",)
            ).fetchall()
        return {"rows": [dict(r) for r in rows]}
    return await asyncio.to_thread(_q)
```

Règles :
- Les requêtes lentes sont enveloppées dans `asyncio.to_thread`.
- Le helper `_percentiles(values)` calcule avg/p50/p95/p99/max.
- Le helper `_range_filter(range_param, ts_col)` parse `today/7d/30d` et retourne un `WHERE` partial.
- ⚠️ Si tu nommes un paramètre `range`, **ne pas** réutiliser le builtin `range()` Python dans la closure (utilise `import builtins; builtins.range(...)` ou un alias).

### 2. Frontend — type API

`ui/src/lib/api.ts` :

```ts
export interface MonthlyCostRow { month: string; cost_usd: number; }

export const api = {
  // ...
  monthlyCost: (months = 12) =>
    req<{ rows: MonthlyCostRow[] }>(`/api/usage/monthly-cost${qs({ months })}`),
};
```

### 3. Frontend — hook React Query

`ui/src/hooks/useQueries.ts` :

```ts
export const useMonthlyCost = (months = 12) =>
  useQuery({
    queryKey: ["monthlyCost", months],
    queryFn: () => api.monthlyCost(months),
    staleTime: 60_000,
  });
```

### 4. Frontend — composant panel

`ui/src/components/panels/MonthlyCostCard.tsx` :

```tsx
import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { useMonthlyCost } from "@/hooks/useQueries";

export function MonthlyCostCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useMonthlyCost(12);

  return (
    <Card>
      <div className="card-head">
        <div>
          <div className="kicker">{t("Coût")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Coût mensuel (12 mois)")}
          </h3>
        </div>
      </div>
      <div className="card-body">
        {isLoading ? (
          <Skeleton className="h-[120px]" />
        ) : (
          <Sparkline values={data?.rows.map((r) => r.cost_usd) ?? []} width={400} height={48} />
        )}
      </div>
    </Card>
  );
}
```

### 5. Brancher dans la page

`ui/src/routes/index.tsx` :

```tsx
import { MonthlyCostCard } from "@/components/panels/MonthlyCostCard";

// ... dans la SectionH "Observabilité"
<div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
  <ProductivityCard />
  <MonthlyCostCard />
</div>
```

### 6. Traductions

Toutes les strings `t("...")` doivent avoir une entrée FR dans `ui/src/locales/fr.json`. Si la clé EN n'existe pas, fallback automatique sur la clé brute.

## Ajouter une palette

`ui/src/tokens.css` :

```css
[data-palette="rose"] {
  --acc:        oklch(0.68 0.18 350);
  --acc-2:      oklch(0.74 0.14 20);
  --acc-3:      oklch(0.62 0.20 320);
  --acc-soft:   oklch(0.68 0.18 350 / 0.14);
  --acc-grad:   linear-gradient(135deg, oklch(0.62 0.20 320), oklch(0.74 0.14 20));
  --pos:        oklch(0.66 0.14 158);
  --neg:        oklch(0.62 0.20 22);
  --warn:       oklch(0.76 0.14 70);
  --info:       oklch(0.66 0.13 220);
  --mdl-opus:   oklch(0.62 0.20 320);
  --mdl-sonnet: oklch(0.68 0.18 350);
  --mdl-haiku:  oklch(0.74 0.14 20);
  --on-acc:     #fafafa;          /* sombre si gradient clair (L > 0.72) */
}
```

`ui/src/hooks/useTheme.ts` :

```ts
export type Palette = "indigo" | "slate" | "mono" | "ocean" | "sunset"
                    | "lavender" | "ember" | "arctic" | "rose";

export const PALETTE_VALUES: Palette[] = [
  "indigo", "slate", "mono", "ocean", "sunset",
  "lavender", "ember", "arctic", "rose",
];
```

`ui/index.html` :

```js
var palette = ["indigo","slate","mono","ocean","sunset","lavender",
               "ember","arctic","rose"].indexOf(p) >= 0 ? p : "indigo";
```

`ui/src/components/layout/TweaksPanel.tsx` :

```tsx
{ value: "rose" as Palette, label: t("Rose"),
  gradient: "linear-gradient(135deg, oklch(0.62 0.20 320), oklch(0.74 0.14 20))" },
```

C'est tout. Le panel s'adapte au nombre d'options (grid 4 colonnes).

## Ajouter une tâche au dispatcher

Pour exécuter un travail Claude Code en arrière-plan :

```bash
curl -X POST http://127.0.0.1:8765/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mon job",
    "prompt": "Analyse foo.py et propose une refacto",
    "model": "claude-sonnet-4-6"
  }'
```

Le job apparaît immédiatement dans le Centre de contrôle. Le dispatcher (`heartbeat.py` toutes les 120 s) le claim et le lance.

Pour piloter une session **dispatcher-managed** depuis le drawer :
- Cliquer la session dans Sessions en direct.
- Le drawer affiche la zone de suivi (et non plus le banner "Lecture seule").
- Le textarea + bouton `Mettre le message en file` envoient au stdin de la session via `.tmp/mission-control-queue/<sid>.jsonl`.

## Ajouter un schedule (cron-like)

```bash
curl -X POST http://127.0.0.1:8765/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sweep matin",
    "cron": "0 9 * * *",
    "task_template": {
      "title": "Daily sweep",
      "prompt": "Vérifie les TODOs du jour"
    }
  }'
```

Ou utiliser le NL parser :

```bash
curl -X POST http://127.0.0.1:8765/api/schedules/parse-nl \
  -d '{"text": "tous les jours à 9h"}'
```

## Ajouter un skill

Créer un répertoire dans `.claude/skills/` :

```
.claude/skills/my-skill/
├── SKILL.md
└── scripts/
    └── ...
```

`SKILL.md` doit contenir un frontmatter YAML décrivant le skill (name, description, environment, autonomy_level). Voir les skills existants comme exemple.

Puis :

```bash
./cc sync                              # rejoue le scrape sessions
curl -X POST http://127.0.0.1:8765/api/skills/sync   # rescan skills
```

Le skill apparaît dans **Compétences & MCP > Registre**. Le segmented Auto/Revue/Manuel permet de changer le niveau d'autonomie (persisté en DB).

## Ajouter un endpoint OTEL

Si Claude Code émet un nouvel event qu'on veut exploiter :

1. Vérifier qu'il arrive bien sur `POST /v1/logs` ou `/v1/metrics` (regarder `OtelPanel` flux temps réel).
2. Ajouter le filtre/agrégation côté serveur :
   ```python
   @app.get("/api/something")
   async def something(range: str = "7d") -> dict[str, Any]:
       rng_clause, rng_args = _range_filter(range, "received_at")
       def _q():
           with connect() as conn:
               return conn.execute(
                   f"""SELECT ... FROM otel_events
                       WHERE event_name = 'my.event' {rng_clause}""",
                   rng_args
               ).fetchall()
       return await asyncio.to_thread(_q)
   ```

## Étendre le système de tweaks

Pour ajouter un nouveau tweak (ex. opacity du halo) :

1. **Token** dans `tokens.css` : `--bg-deco-opacity: 0.9;` et utiliser dans `.bg-deco`.
2. **State** dans `TweaksPanel.tsx` :
   ```ts
   const [haloOpacity, setHaloOpacity] = usePersistedNumber(
     "cc-halo-opacity", 90,
     (v) => setRootVar("--bg-deco-opacity", String(v / 100))
   );
   ```
3. **UI** : ajouter un `<Slider>` dans la section Décor.

Pour les **toggles** : utiliser le hook `usePersistedBool` ou `useBodyToggle` (si la valeur drive un attribut sur `<body>`).

Pour les **segmented** : utiliser le composant partagé `<Segmented>` avec `variant="primary"` (gradient accent) ou `variant="subtle"` (bg-card).

## Tests

E2E (Playwright) :

```bash
cd ui && npm run test:e2e
```

Tests existants : aucun pour l'instant, à brancher dans `ui/tests/`. Le serveur backend doit tourner pour les tests.

Type check :

```bash
cd ui && ./node_modules/.bin/tsc --noEmit
```

## Conventions

- Pas de `Math.random()` ou de générateur pseudo-aléatoire dans l'UI : si la donnée n'existe pas, afficher un état vide (`—` ou un message).
- Préférer `Toggle` / `Segmented` partagés plutôt que de re-rouler des markups.
- Utiliser `var(--xxx)` dans les `style={{}}` plutôt que des hex hardcodés.
- Texte sur fond accent : utiliser `var(--on-acc)`, **jamais** un `#0a0a12` figé.
- Bordures : `border-[0.5px] border-hairline` (pas `border border-border/70` qui rend des fines lignes blanches en dark).
- Tabular nums : ajouter la classe `tnum` sur tous les chiffres dans une liste pour qu'ils s'alignent.

## Pré-commit utile

```bash
cd ui && ./node_modules/.bin/tsc --noEmit && npx vite build
```

Si le build casse, le serveur continue à servir la dernière version OK depuis `ui/dist/`.
